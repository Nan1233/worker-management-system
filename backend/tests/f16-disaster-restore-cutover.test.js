'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const fsp=require('node:fs/promises');
const os=require('node:os');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const {
 safeFingerprint,assertCutoverEligibility,assertRollbackEligibility,assertTransition,transition,calculateRecoveryMetrics,cleanupPolicy
}=require('../services/disasterRestoreLifecycleService');
const {redact}=require('../services/disasterRestorePolicyService');
const root=path.resolve(__dirname,'..');
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');

function verifiedState(){
 const target=safeFingerprint({host:'restore.local',port:'4000',database:'worker_management_restore_1',user:'restore_user'});
 const old=safeFingerprint({host:'active.local',port:'4000',database:'worker_management',user:'app_user'});
 return {
  restoreId:'restore_20260813_abc123', finalState:'VERIFIED_NOT_ACTIVATED', schemaReady:true, schemaStatus:'READY',
  expectedMigration:25, actualMigration:25, integrityReady:true, sessionsInvalidated:true, activeSessionsRemaining:0,
  backupSha256:'a'.repeat(64), backupCreatedAt:'2026-08-13T00:00:00.000Z', restoreStartedAt:'2026-08-13T01:00:00.000Z', restoreVerifiedAt:'2026-08-13T01:15:00.000Z',
  verifiedTargetFingerprint:target, preCutoverActiveFingerprint:old, auditTrail:[],
 };
}
function cutoverContext(){return {maintenanceMode:'RESTORE',workersQuiesced:'YES',jobsQuiesced:'YES',target:{host:'restore.local',port:'4000',database:'worker_management_restore_1',user:'restore_user'},active:{host:'active.local',port:'4000',database:'worker_management',user:'app_user'}};}

test('cutover blocked without VERIFIED_NOT_ACTIVATED state',()=>{const s=verifiedState();s.finalState='FAILED';assert.throws(()=>assertCutoverEligibility(s,cutoverContext()),e=>e.code==='CUTOVER_BLOCKED'&&e.details.failures.includes('STATE_NOT_VERIFIED_NOT_ACTIVATED'));});
test('cutover blocked when schema verifier is not READY',()=>{const s=verifiedState();s.schemaStatus='MIGRATIONS_PENDING';assert.throws(()=>assertCutoverEligibility(s,cutoverContext()),e=>e.details.failures.includes('SCHEMA_NOT_READY'));});
test('cutover blocked when migration is not exact 025',()=>{const s=verifiedState();s.actualMigration=24;assert.throws(()=>assertCutoverEligibility(s,cutoverContext()),e=>e.details.failures.includes('MIGRATION_NOT_025'));});
test('cutover blocked with active restored sessions',()=>{const s=verifiedState();s.activeSessionsRemaining=1;assert.throws(()=>assertCutoverEligibility(s,cutoverContext()),e=>e.details.failures.includes('ACTIVE_SESSIONS_REMAIN'));});
test('cutover blocked without maintenance mode',()=>{const c=cutoverContext();c.maintenanceMode='';assert.throws(()=>assertCutoverEligibility(verifiedState(),c),e=>e.details.failures.includes('MAINTENANCE_NOT_ACTIVE'));});
test('cutover blocked if workers/jobs are not quiesced',()=>{const c=cutoverContext();c.workersQuiesced='NO';c.jobsQuiesced='NO';assert.throws(()=>assertCutoverEligibility(verifiedState(),c),e=>e.details.failures.includes('WORKERS_NOT_QUIESCED')&&e.details.failures.includes('JOBS_NOT_QUIESCED'));});
test('cutover blocked if verified target fingerprint does not match requested target',()=>{const c=cutoverContext();c.target.database='worker_management_restore_other';assert.throws(()=>assertCutoverEligibility(verifiedState(),c),e=>e.details.failures.includes('CUTOVER_TARGET_MISMATCH'));});
test('cutover eligibility PASS when every gate is satisfied',()=>assert.equal(assertCutoverEligibility(verifiedState(),cutoverContext()).eligible,true));

test('rollback requires retained old DB and operator confirmation',()=>{let s=transition(verifiedState(),'CUTOVER_ELIGIBLE');s=transition(s,'CUTOVER_IN_PROGRESS');s=transition(s,'ACTIVE');const ctx={maintenanceMode:'RESTORE',workersQuiesced:'YES',jobsQuiesced:'YES',confirm:'KTC_DISASTER_ROLLBACK',oldDbExists:false,oldTarget:{host:'active.local',port:'4000',database:'worker_management',user:'app_user'}};assert.throws(()=>assertRollbackEligibility(s,ctx),e=>e.details.failures.includes('OLD_DB_NOT_CONFIRMED_RETAINED'));ctx.oldDbExists=true;assert.equal(assertRollbackEligibility(s,ctx).eligible,true);});
test('rollback target cannot be the restored DB',()=>{let s=transition(verifiedState(),'CUTOVER_ELIGIBLE');s=transition(s,'CUTOVER_IN_PROGRESS');s=transition(s,'CUTOVER_FAILED');const ctx={maintenanceMode:'RESTORE',workersQuiesced:'YES',jobsQuiesced:'YES',confirm:'KTC_DISASTER_ROLLBACK',oldDbExists:true,oldTarget:{host:'restore.local',port:'4000',database:'worker_management_restore_1',user:'restore_user'}};assert.throws(()=>assertRollbackEligibility(s,ctx),e=>e.code==='ROLLBACK_BLOCKED');});
test('state machine rejects invalid transition',()=>assert.throws(()=>assertTransition('VERIFIED_NOT_ACTIVATED','ACTIVE'),e=>e.code==='RESTORE_STATE_TRANSITION_INVALID'));
test('failed cutover keeps rollback path and old DB fingerprint in state',()=>{let s=transition(verifiedState(),'CUTOVER_ELIGIBLE');s=transition(s,'CUTOVER_IN_PROGRESS');s=transition(s,'CUTOVER_FAILED',{operatorAction:'EXTERNAL_CUTOVER_FAILED'});assert.equal(s.finalState,'CUTOVER_FAILED');assert.ok(s.preCutoverActiveFingerprint.fingerprint);assert.match(JSON.stringify(s.auditTrail),/EXTERNAL_CUTOVER_FAILED/);});
test('RPO and RTO estimates are calculated from recorded timestamps',()=>{let s=verifiedState();s.incidentAt='2026-08-13T00:30:00.000Z';s=transition(s,'CUTOVER_ELIGIBLE',{at:'2026-08-13T01:20:00.000Z'});s=transition(s,'CUTOVER_IN_PROGRESS',{at:'2026-08-13T01:21:00.000Z'});s=transition(s,'ACTIVE',{at:'2026-08-13T01:25:00.000Z'});const m=calculateRecoveryMetrics(s);assert.equal(m.rpoEstimateMs,85*60*1000);assert.equal(m.rtoEstimateMs,55*60*1000);});
test('stale restore targets are never auto-dropped',()=>{const p=cleanupPolicy({...verifiedState(),finalState:'FAILED',failedAt:'2026-08-01T00:00:00.000Z'},{now:new Date('2026-08-13T00:00:00.000Z'),minRetentionHours:24});assert.equal(p.neverAutoDrop,true);assert.equal(p.eligibleForManualCleanup,true);const active=cleanupPolicy({...verifiedState(),finalState:'ACTIVE',cutoverCompletedAt:'2026-08-01T00:00:00.000Z'},{now:new Date('2026-08-13T00:00:00.000Z'),minRetentionHours:24});assert.equal(active.eligibleForManualCleanup,false);});
test('secret redaction still masks operational secrets',()=>{const value=redact('password=abc token=def secret=ghi restore_id=restore_x');assert.doesNotMatch(value,/abc|def|ghi/);assert.match(value,/restore_x/);});
test('cutover-check and rollback-check contain no infrastructure mutation commands',()=>{for(const f of ['scripts/checkDisasterRestoreCutover.js','scripts/checkDisasterRestoreRollback.js','scripts/checkDisasterRestoreCleanup.js']){const s=read(f);assert.doesNotMatch(s,/DROP DATABASE|CREATE DATABASE|ALTER DATABASE|RENAME DATABASE|render\.com|fetch\(/i);}});
test('cutover record only updates audit state and never switches infrastructure',()=>{const s=read('scripts/recordDisasterRestoreCutover.js');assert.match(s,/infrastructure_mutation:false/);assert.doesNotMatch(s,/DROP DATABASE|CREATE DATABASE|ALTER DATABASE|RENAME DATABASE|render\.com/i);});
test('rollback record only updates audit state and never switches infrastructure',()=>{const s=read('scripts/recordDisasterRestoreRollback.js');assert.match(s,/infrastructure_mutation:false/);assert.doesNotMatch(s,/DROP DATABASE|CREATE DATABASE|ALTER DATABASE|RENAME DATABASE|render\.com/i);});

test('cutover-check executes with zero state mutation',async()=>{
 const dir=await fsp.mkdtemp(path.join(os.tmpdir(),'ktc-f16-cutover-'));
 const file=path.join(dir,'restore_state.json'); const state=verifiedState(); await fsp.writeFile(file,JSON.stringify(state,null,2)); const before=await fsp.readFile(file,'utf8');
 const r=spawnSync(process.execPath,[path.join(root,'scripts/checkDisasterRestoreCutover.js'),'--state-file',file,'--target-host','restore.local','--target-port','4000','--target-db','worker_management_restore_1','--target-user','different_runtime_user','--active-host','active.local','--active-port','4000','--active-db','worker_management','--active-user','app_user'],{env:{...process.env,KTC_MAINTENANCE_MODE:'RESTORE',KTC_WORKERS_QUIESCED:'YES',KTC_JOBS_QUIESCED:'YES'},encoding:'utf8'});
 assert.equal(r.status,0,r.stderr); assert.match(r.stdout,/ELIGIBLE_BUT_NOT_PERFORMED/); assert.match(r.stdout,/"infrastructure_mutation": false/); const after=await fsp.readFile(file,'utf8'); assert.equal(after,before);
});
