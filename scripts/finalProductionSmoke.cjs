#!/usr/bin/env node
'use strict';
const {spawnSync}=require('node:child_process');const path=require('node:path');const root=path.resolve(__dirname,'..');
const checks=[['backend syntax','node',['--check','backend/server.js']],['security contract','node',['scripts/securityContract.cjs']],['runtime security','node',['scripts/securityRuntimeAudit.cjs']],['production read-only smoke','node',['scripts/productionSmokeE2E.cjs']]];
const results=[];for(const [name,cmd,args] of checks){const r=spawnSync(cmd,args,{cwd:root,stdio:'inherit',env:process.env});const ok=r.status===0;results.push({name,result:ok?'PASS':'FAIL'});if(!ok){console.error(`FINAL_SMOKE_STOPPED=${name}`);process.exitCode=1;break}}
console.table(results);console.log(`KTC_FINAL_PRODUCTION_SMOKE=${results.every(x=>x.result==='PASS')?'PASS':'FAIL'}`);
