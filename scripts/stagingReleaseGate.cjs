#!/usr/bin/env node
'use strict';
const {spawnSync}=require('node:child_process');const path=require('node:path');const root=path.resolve(__dirname,'..');
if(/onrender\.com|tidbcloud/i.test(String(process.env.LOCAL_BACKEND_URL||process.env.KTC_RUNTIME_API_URL||''))){console.error('KTC_STAGING_RELEASE_GATE_BLOCKED: write-path gate cannot target production');process.exit(1)}
const commands=[['critical business E2E','node',['scripts/zero-cost/critical-e2e.cjs']],['large-data performance','node',['scripts/performanceLargeData.cjs']],['runtime security','node',['scripts/securityRuntimeAudit.cjs']]];
for(const [name,cmd,args] of commands){const r=spawnSync(cmd,args,{cwd:root,stdio:'inherit',env:process.env});if(r.status!==0){console.error(`KTC_STAGING_RELEASE_GATE_FAIL=${name}`);process.exit(r.status||1)}}
console.log('KTC_STAGING_RELEASE_GATE=PASS');
