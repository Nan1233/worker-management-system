#!/usr/bin/env node
const {spawnSync}=require('child_process'); const cmds=[['npm',['--prefix','desktop','run','smoke:excel']],['npm',['--prefix','desktop','run','check:excel-db-sync']]];for(const [c,a] of cmds){const r=spawnSync(c,a,{stdio:'inherit',env:process.env,shell:process.platform==='win32'});if(r.status!==0)process.exit(r.status||1);}console.log('KTC_EXCEL_RUNTIME=PASS');
