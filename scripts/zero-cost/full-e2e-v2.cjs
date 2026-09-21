#!/usr/bin/env node
const {spawnSync}=require('child_process');const path=require('path');const root=path.resolve(__dirname,'../..');
for(const script of ['critical-e2e.cjs','historical-dashboard-e2e.cjs']){const r=spawnSync(process.execPath,[path.join(__dirname,script)],{cwd:root,stdio:'inherit',env:process.env});if(r.status!==0)process.exitCode=r.status||1}
console.log(`KTC_FULL_E2E=${process.exitCode?'FAIL':'PASS'}`)
