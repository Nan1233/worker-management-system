'use strict';
try { require('dotenv').config(); } catch (_) { /* dry-run/static environments may not have dependencies installed */ }
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { verifyBackupArtifact } = require('../services/disasterBackupArtifactService');
const { defaultTargetDatabase, restoreId, assertSafeRestorePlan } = require('../services/disasterRestorePolicyService');
const { transition, safeFingerprint } = require('../services/disasterRestoreLifecycleService');

function arg(name){ const i=process.argv.indexOf(name); return i>=0 ? process.argv[i+1] : null; }
const has=(name)=>process.argv.includes(name);
function runNode(script,args,env){ return new Promise((resolve,reject)=>{ const child=spawn(process.execPath,[script,...args],{cwd:path.resolve(__dirname,'..'),env,stdio:'inherit'}); child.on('error',reject); child.on('exit',(code)=>code===0?resolve():reject(Object.assign(new Error(`${path.basename(script)} exit ${code}`),{code:'RESTORE_PHASE_FAILED',exitCode:code}))); }); }
async function writeState(file,state){ await fs.mkdir(path.dirname(file),{recursive:true}); await fs.writeFile(file,JSON.stringify(state,null,2),'utf8'); }
function targetConfig(){
  const host=String(process.env.KTC_RESTORE_DB_HOST||'').trim(); const user=String(process.env.KTC_RESTORE_DB_USER||'').trim(); const password=String(process.env.KTC_RESTORE_DB_PASSWORD||'');
  if(!host||!user||!password) throw Object.assign(new Error('Thiếu KTC_RESTORE_DB_HOST/USER/PASSWORD'),{code:'RESTORE_TARGET_CREDENTIALS_REQUIRED'});
  const port=Number(process.env.KTC_RESTORE_DB_PORT||4000); const sslEnabled=['true','1','yes'].includes(String(process.env.KTC_RESTORE_DB_SSL??'true').toLowerCase());
  return {host,port,user,password,ssl:sslEnabled?{minVersion:'TLSv1.2',rejectUnauthorized:true}:undefined};
}
function activeFingerprintFromEnv(){
  if(!process.env.DB_HOST || !process.env.DB_NAME) return null;
  return safeFingerprint({host:process.env.DB_HOST,port:process.env.DB_PORT||'4000',database:process.env.DB_NAME,user:process.env.DB_USER||''});
}
async function collectVerifiedTargetState(cfg,target){
  const mysql=require('mysql2/promise');
  const db=await mysql.createConnection({...cfg,database:target});
  try{
    const [[versionRow]] = await db.query('SELECT VERSION() AS db_version, DATABASE() AS current_database, CURRENT_USER() AS current_user');
    const [[sessions]] = await db.query('SELECT COUNT(*) AS active_sessions FROM user_sessions WHERE revoked_at IS NULL');
    return {
      dbVersion:String(versionRow?.db_version||''),
      currentDatabase:String(versionRow?.current_database||target),
      currentUser:String(versionRow?.current_user||cfg.user),
      schemaContractVersion:26,
      activeSessionsRemaining:Number(sessions?.active_sessions ?? -1),
      verifiedTargetFingerprint:safeFingerprint({host:cfg.host,port:cfg.port,database:String(versionRow?.current_database||target),user:String(versionRow?.current_user||cfg.user)}),
    };
  } finally { await db.end().catch(()=>{}); }
}
async function main(){
  const file=path.resolve(arg('--file')||''); if(!arg('--file')) throw Object.assign(new Error('Thiếu --file'),{code:'BACKUP_FILE_REQUIRED'});
  const dryRun=has('--dry-run'); const id=arg('--restore-id')||restoreId(); const target=arg('--target-db')||process.env.KTC_RESTORE_TARGET_DB||defaultTargetDatabase();
  const targetHost=process.env.KTC_RESTORE_DB_HOST||''; const targetPort=process.env.KTC_RESTORE_DB_PORT||'4000';
  assertSafeRestorePlan({activeDb:process.env.DB_NAME,activeHost:process.env.DB_HOST,activePort:process.env.DB_PORT||'4000',targetDb:target,targetHost,targetPort,envClass:arg('--env-class')||process.env.KTC_RUNTIME_ENV_CLASS||process.env.KTC_RESTORE_ENV_CLASS,confirm:arg('--confirm'),dryRun});
  const stateFile=path.resolve(process.env.KTC_RESTORE_STATE_DIR||path.join(os.tmpdir(),'ktc-restore-state'),`${id}.json`);
  const state={
    restoreId:id,
    backup:path.basename(file),
    targetDb:target,
    activeDb:process.env.DB_NAME||null,
    phase:'PLANNED',
    finalState:'PLANNED',
    schemaReady:false,
    schemaStatus:'UNKNOWN',
    integrityReady:false,
    sessionsInvalidated:false,
    activeSessionsRemaining:null,
    cutoverPerformed:false,
    restoreStartedAt:new Date().toISOString(),
    startedAt:new Date().toISOString(),
    incidentAt:arg('--incident-at')||process.env.KTC_INCIDENT_AT||null,
    preCutoverActiveFingerprint:activeFingerprintFromEnv(),
    auditTrail:[],
  };
  await writeState(stateFile,state);
  try{
    Object.assign(state,transition(state,'VERIFYING_BACKUP',{operatorAction:'RESTORE_VERIFY_BACKUP_START'})); await writeState(stateFile,state);
    const artifact=await verifyBackupArtifact(file);
    state.backupSha256=artifact.sha256; state.backupFingerprint=artifact.sha256; state.backupCreatedAt=artifact.createdAt; state.backupFormat=artifact.format;
    state.schemaContractVersion=26;
    console.log(JSON.stringify({restore_id:id,dry_run:dryRun,backup_sha256:artifact.sha256,target:{host:targetHost||null,port:targetPort,database:target},active:{host:process.env.DB_HOST||null,port:process.env.DB_PORT||'4000',database:process.env.DB_NAME||null},action:dryRun?'VERIFY_AND_PLAN_ONLY':'STAGED_RESTORE_NO_CUTOVER'},null,2));
    if(dryRun){ state.finalState='DRY_RUN_VERIFIED'; state.phase='DONE'; state.completedAt=new Date().toISOString(); await writeState(stateFile,state); return; }

    Object.assign(state,transition(state,'RESTORING',{operatorAction:'RESTORE_TARGET_CREATE_AND_LOAD'})); await writeState(stateFile,state);
    const cfg=targetConfig(); const mysql=require('mysql2/promise'); const admin=await mysql.createConnection(cfg);
    try{
      const [exists]=await admin.query('SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=?',[target]);
      if(exists.length) throw Object.assign(new Error('Restore target DB đã tồn tại; không overwrite. Dùng target mới.'),{code:'RESTORE_TARGET_EXISTS'});
      await admin.query(`CREATE DATABASE \`${target}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    } finally { await admin.end().catch(()=>{}); }

    const env={...process.env,DB_HOST:cfg.host,DB_PORT:String(cfg.port),DB_USER:cfg.user,DB_PASSWORD:cfg.password,DB_NAME:target,DB_SSL:process.env.KTC_RESTORE_DB_SSL||'true',KTC_RESTORE_LOW_LEVEL:'YES',KTC_RUNTIME_ENV_CLASS:'DISPOSABLE'};
    await runNode(path.join(__dirname,'restoreDatabaseBackupIntoTarget.js'),['--file',file],env);
    Object.assign(state,transition(state,'VERIFYING_SCHEMA',{operatorAction:'RESTORE_VERIFY_DATABASE_CONTRACT'})); await writeState(stateFile,state);
    await runNode(path.join(__dirname,'verifyDatabaseSchema.js'),[],env);
    Object.assign(state,transition(state,'VERIFYING',{operatorAction:'RESTORE_VERIFY_SCHEMA_AND_DATA'})); await writeState(stateFile,state);
    await runNode(path.join(__dirname,'verifyDatabaseSchema.js'),[],env); state.schemaReady=true; state.schemaStatus='READY';
    await runNode(path.join(__dirname,'checkDatabaseIntegrity.js'),[],env);
    await runNode(path.join(__dirname,'verifyDisasterRestoreData.js'),[],env); state.integrityReady=true;
    Object.assign(state,transition(state,'INVALIDATING_SESSIONS',{operatorAction:'RESTORE_INVALIDATE_SESSIONS'})); await writeState(stateFile,state);
    await runNode(path.join(__dirname,'invalidateRestoredSessions.js'),[],env); state.sessionsInvalidated=true;
    await runNode(path.join(__dirname,'verifyDatabaseSchema.js'),[],env);
    const observed=await collectVerifiedTargetState(cfg,target); Object.assign(state,observed);
    if(state.schemaStatus !== 'READY') throw Object.assign(new Error('Final restored database contract is not READY'),{code:'RESTORE_DATABASE_CONTRACT_INVALID'});
    if(state.activeSessionsRemaining !== 0) throw Object.assign(new Error('Restored active sessions remain after invalidation'),{code:'RESTORE_ACTIVE_SESSIONS_REMAIN'});
    state.restoreVerifiedAt=new Date().toISOString();
    Object.assign(state,transition(state,'VERIFIED_NOT_ACTIVATED',{operatorAction:'RESTORE_VERIFIED_NOT_ACTIVATED'})); state.phase='DONE'; state.completedAt=state.restoreVerifiedAt; await writeState(stateFile,state);
    console.log(`[KTC][F16] STAGED RESTORE VERIFIED restore_id=${id} target=${target} CUTOVER=NOT_PERFORMED`);
  }catch(error){ state.finalState='FAILED'; state.phase='FAILED'; state.failureCode=error.code||'RESTORE_FAILED'; state.failedAt=new Date().toISOString(); state.auditTrail=[...(state.auditTrail||[]),{at:state.failedAt,action:'RESTORE_FAILED',code:state.failureCode}]; await writeState(stateFile,state).catch(()=>{}); throw error; }
}
main().catch((e)=>{ console.error(`[KTC][F16] Restore failed: ${e.code||'RESTORE_FAILED'}`); process.exitCode=1; });
