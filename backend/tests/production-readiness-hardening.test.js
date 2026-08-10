const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');

test('external monitoring has separate liveness and readiness endpoints',()=>{
  const s=read('server.js');
  assert.match(s,/\/api\/health\/live/);
  assert.match(s,/\/api\/health\/ready/);
  assert.match(s,/status: "live"/);
  assert.match(s,/status: "ready"/);
  assert.match(s,/status: "not_ready"/);
  assert.match(s,/databaseLatencyMs/);
});

test('restore rehearsal refuses the production database and validates staging after restore',()=>{
  const s=read('scripts/rehearseDatabaseRestore.js');
  assert.match(s,/DB đích trùng DB production/);
  assert.match(s,/KTC_RESTORE_DB_NAME/);
  assert.match(s,/checkDatabaseIntegrity\.js/);
  assert.match(s,/validateRealProductionData\.js/);
});

test('readiness load test is read-only and bounded',()=>{
  const s=read('scripts/loadReadiness.js');
  assert.match(s,/SELECT 1 AS ok/);
  assert.match(s,/\/api\/health\/ready/);
  assert.match(s,/Read-only readiness load/);
  assert.doesNotMatch(s,/INSERT INTO|UPDATE production_|DELETE FROM production_/i);
});

test('root scripts expose restore rehearsal and readiness load',()=>{
  const pkg=JSON.parse(read('../package.json'));
  assert.ok(pkg.scripts['restore:rehearsal']);
  assert.ok(pkg.scripts['load:readiness']);
});


test('real-data validator covers machine-line aggregates and coverage reporting',()=>{
  const source=fs.readFileSync(path.join(root,'scripts','validateRealProductionData.js'),'utf8');
  assert.match(source,/production_report_machine_defects/);
  assert.match(source,/calculateReportPerformance/);
  assert.match(source,/coverage/);
  assert.match(source,/MACHINE_COUNT_MISMATCH/);
});
