#!/usr/bin/env node
const {spawnSync}=require('child_process');
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'../..');
const fixturePath=path.resolve(process.env.KTC_ZERO_COST_FIXTURE||'validation-artifacts/fixture.json');
const base=process.env.LOCAL_BACKEND_URL||'https://ktc-be-test.nan978971.workers.dev';

// Full E2E requires an explicitly prepared test fixture. Never auto-seed a
// remote/production TiDB database from this runner.
if(!fs.existsSync(fixturePath)){
  console.error(`KTC_FULL_E2E_NOT_READY: missing ${fixturePath}`);
  console.error('Prepare the test fixture first; this runner will not seed worker_management remotely.');
  process.exit(2);
}
process.env.LOCAL_BACKEND_URL=base;
let failed=false;
for(const script of ['critical-e2e.cjs','historical-dashboard-e2e.cjs']){
  const r=spawnSync(process.execPath,[path.join(__dirname,script)],{cwd:root,stdio:'inherit',env:process.env});
  if(r.status!==0) failed=true;
}
console.log(`KTC_FULL_E2E=${failed?'FAIL':'PASS'}`);
process.exit(failed?1:0);
