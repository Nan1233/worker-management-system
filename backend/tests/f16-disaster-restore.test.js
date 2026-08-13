'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const fsp=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const zlib=require('node:zlib');
const crypto=require('node:crypto');
const {verifyBackupArtifact}=require('../services/disasterBackupArtifactService');
const {assertSafeRestorePlan,assertCutoverAllowed,redact}=require('../services/disasterRestorePolicyService');

const root=path.resolve(__dirname,'..');
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
function sha256(buf){return crypto.createHash('sha256').update(buf).digest('hex');}
async function fixture({lines,format='KTC_DB_JSONL_GZIP_V1',manifestTables={demo:{rows:1}},includeChecksum=true,includeManifest=true,name='backup.jsonl.gz'}={}){
  const dir=await fsp.mkdtemp(path.join(os.tmpdir(),'ktc-f16-'));
  const file=path.join(dir,name);
  const records=lines||[
    {type:'meta',format,created_at:'2026-08-13T00:00:00.000Z',database:'demo',table_count:1},
    {type:'schema',table:'demo',create_sql:'CREATE TABLE `demo` (`id` int NOT NULL)'},
    {type:'row',table:'demo',data:{id:1}},
    {type:'table_end',table:'demo',rows:1},
    {type:'end',tables:{demo:{rows:1}},completed_at:'2026-08-13T00:00:01.000Z'},
  ];
  const gz=zlib.gzipSync(Buffer.from(records.map(x=>JSON.stringify(x)).join('\n')+'\n'));
  await fsp.writeFile(file,gz);
  const hash=sha256(gz);
  if(includeChecksum) await fsp.writeFile(`${file}.sha256`,`${hash}  ${name}\n`);
  if(includeManifest) await fsp.writeFile(`${file}.manifest.json`,JSON.stringify({format,created_at:'2026-08-13T00:00:00.000Z',database:'demo',tables:manifestTables,sha256:hash,encrypted:false}));
  return {dir,file,hash};
}

test('valid V1 artifact passes complete verification',async()=>{
 const x=await fixture(); const r=await verifyBackupArtifact(x.file); assert.equal(r.success,true); assert.equal(r.tableCount,1); assert.equal(r.rowCount,1);
});

test('corrupted gzip is rejected even when sidecar checksum matches corrupted bytes',async()=>{
 const x=await fixture(); const bad=Buffer.from('not-gzip'); await fsp.writeFile(x.file,bad); const h=sha256(bad); await fsp.writeFile(`${x.file}.sha256`,`${h} x\n`); const m=JSON.parse(await fsp.readFile(`${x.file}.manifest.json`));m.sha256=h;await fsp.writeFile(`${x.file}.manifest.json`,JSON.stringify(m)); await assert.rejects(()=>verifyBackupArtifact(x.file),e=>['BACKUP_STREAM_INVALID','Z_DATA_ERROR'].includes(e.code)||/gzip|stream/i.test(e.message));
});

test('truncated logical backup without end marker is rejected',async()=>{
 const x=await fixture({lines:[{type:'meta',format:'KTC_DB_JSONL_GZIP_V1',created_at:'2026-08-13',tables:{}},{type:'schema',table:'demo',create_sql:'CREATE TABLE demo(id int)'},{type:'row',table:'demo',data:{id:1}},{type:'table_end',table:'demo',rows:1}]}); await assert.rejects(()=>verifyBackupArtifact(x.file),e=>e.code==='BACKUP_END_MARKER_INVALID');
});

test('malformed JSONL record is rejected',async()=>{
 const dir=await fsp.mkdtemp(path.join(os.tmpdir(),'ktc-f16-')); const file=path.join(dir,'bad.jsonl.gz'); const gz=zlib.gzipSync(Buffer.from('{"type":"meta","format":"KTC_DB_JSONL_GZIP_V1"}\nNOT JSON\n')); await fsp.writeFile(file,gz); const h=sha256(gz); await fsp.writeFile(`${file}.sha256`,h+'  bad\n'); await fsp.writeFile(`${file}.manifest.json`,JSON.stringify({format:'KTC_DB_JSONL_GZIP_V1',created_at:'x',tables:{},sha256:h})); await assert.rejects(()=>verifyBackupArtifact(file),e=>e.code==='BACKUP_RECORD_MALFORMED');
});

test('unsupported backup version is rejected before restore',async()=>{const x=await fixture({format:'KTC_DB_JSONL_GZIP_V99'});await assert.rejects(()=>verifyBackupArtifact(x.file),e=>e.code==='BACKUP_VERSION_UNSUPPORTED');});
test('missing checksum is rejected',async()=>{const x=await fixture({includeChecksum:false});await assert.rejects(()=>verifyBackupArtifact(x.file),e=>e.code==='BACKUP_CHECKSUM_MISSING');});
test('missing manifest is rejected',async()=>{const x=await fixture({includeManifest:false});await assert.rejects(()=>verifyBackupArtifact(x.file),e=>e.code==='BACKUP_MANIFEST_INVALID');});
test('duplicate schema section is rejected',async()=>{const lines=[{type:'meta',format:'KTC_DB_JSONL_GZIP_V1',created_at:'x'},{type:'schema',table:'demo',create_sql:'CREATE TABLE demo(id int)'},{type:'schema',table:'demo',create_sql:'CREATE TABLE demo(id int)'},{type:'row',table:'demo',data:{id:1}},{type:'table_end',table:'demo',rows:1},{type:'end',tables:{demo:{rows:1}}}];const x=await fixture({lines});await assert.rejects(()=>verifyBackupArtifact(x.file),e=>e.code==='BACKUP_DUPLICATE_SECTION');});

test('production/active target is refused',()=>assert.throws(()=>assertSafeRestorePlan({activeDb:'worker_management',activeHost:'db.example',activePort:'4000',targetDb:'worker_management',targetHost:'db.example',targetPort:'4000',envClass:'DISASTER_RECOVERY',confirm:'KTC_DISASTER_RESTORE_STAGE'}),e=>e.code==='RESTORE_ACTIVE_DB_REFUSED'));
test('mutation requires environment classification',()=>assert.throws(()=>assertSafeRestorePlan({activeDb:'prod',targetDb:'worker_management_restore_1',confirm:'KTC_DISASTER_RESTORE_STAGE'}),e=>e.code==='RESTORE_ENV_CLASS_REQUIRED'));
test('mutation requires explicit confirmation token',()=>assert.throws(()=>assertSafeRestorePlan({activeDb:'prod',targetDb:'worker_management_restore_1',envClass:'STAGING'}),e=>e.code==='RESTORE_CONFIRMATION_REQUIRED'));
test('restore target naming is constrained',()=>assert.throws(()=>assertSafeRestorePlan({activeDb:'prod',targetDb:'randomdb',envClass:'STAGING',confirm:'KTC_DISASTER_RESTORE_STAGE'}),e=>e.code==='RESTORE_TARGET_NAME_UNSAFE'));
test('dry-run plan does not require mutation confirmation',()=>assert.doesNotThrow(()=>assertSafeRestorePlan({activeDb:'prod',targetDb:'worker_management_restore_dryrun',dryRun:true})));
test('cutover forbidden before all verification gates pass',()=>assert.throws(()=>assertCutoverAllowed({finalState:'FAILED'}),e=>e.code==='CUTOVER_BLOCKED'));
test('legacy cutover helper now enforces full Part 2 context',()=>assert.throws(()=>assertCutoverAllowed({finalState:'VERIFIED_NOT_ACTIVATED',schemaReady:true,schemaStatus:'READY',expectedMigration:25,actualMigration:25,integrityReady:true,sessionsInvalidated:true,activeSessionsRemaining:0,restoreId:'restore_test',backupSha256:'a'.repeat(64)}),e=>e.code==='CUTOVER_BLOCKED'));
test('secret redaction masks password/token/secret values',()=>{const v=redact('password=abc token:xyz secret=qwe normal=ok');assert.doesNotMatch(v,/abc|xyz|qwe/);assert.match(v,/normal=ok/);});

test('canonical orchestrator fully verifies before first target mutation and never performs cutover',()=>{const s=read('scripts/disasterRestoreDatabase.js');const verify=s.indexOf('await verifyBackupArtifact(file)');const create=s.indexOf('CREATE DATABASE');assert.ok(verify>=0&&create>verify);assert.match(s,/VERIFIED_NOT_ACTIVATED/);assert.match(s,/CUTOVER=NOT_PERFORMED/);assert.doesNotMatch(s,/RENAME DATABASE|DROP DATABASE|ALTER DATABASE.*production/i);});
test('failed staged restore records failure and retains target instead of cutover',()=>{const s=read('scripts/disasterRestoreDatabase.js');assert.match(s,/finalState='FAILED'/);assert.match(s,/RESTORE_TARGET_EXISTS/);assert.doesNotMatch(s,/DROP DATABASE/);});
test('older restore state must pass canonical db release then schema verify before activation',()=>{const s=read('scripts/disasterRestoreDatabase.js');const release=s.indexOf("'releaseDatabase.js'");const schema=s.indexOf("'verifyDatabaseSchema.js'");const final=s.indexOf("VERIFIED_NOT_ACTIVATED");assert.ok(release>0&&schema>release&&final>schema);});
test('restored sessions are explicitly revoked before cutover eligibility',()=>{const s=read('scripts/invalidateRestoredSessions.js');assert.match(s,/UPDATE user_sessions SET revoked_at/);assert.match(s,/active_remaining:0/);const o=read('scripts/disasterRestoreDatabase.js');assert.ok(o.indexOf('invalidateRestoredSessions.js')<o.indexOf('VERIFIED_NOT_ACTIVATED'));});
test('maintenance mode blocks web writes and worker processing during restore cutover window',()=>{const server=read('server.js');const worker=read('worker.js');assert.match(server,/KTC_MAINTENANCE_MODE/);assert.match(server,/MAINTENANCE_RESTORE/);assert.match(worker,/WORKER_MAINTENANCE_BLOCKED/);});
test('dry-run is structurally zero-mutation before early return',()=>{const s=read('scripts/disasterRestoreDatabase.js');const early=s.indexOf("if(dryRun){");const create=s.indexOf('CREATE DATABASE');assert.ok(early>0&&create>early);const block=s.slice(early,create);assert.match(block,/return/);});
test('restore target existing is never overwritten or resumed implicitly',()=>{const s=read('scripts/disasterRestoreDatabase.js');assert.match(s,/RESTORE_TARGET_EXISTS/);assert.doesNotMatch(s,/--replace|DELETE FROM/);});
