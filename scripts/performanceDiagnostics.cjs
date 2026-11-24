#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),{performance}=require('node:perf_hooks');
const env=process.env;
const out=path.resolve(env.KTC_PERF_DIAGNOSTICS_OUTPUT||'validation-artifacts/performance-diagnostics.json');
const report={startedAt:new Date().toISOString(),database:null,browser:null};
const pct=(a,q)=>[...a].sort((x,y)=>x-y)[Math.ceil(a.length*q)-1]??null;
const round=x=>Math.round(x*100)/100;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function database(){
 if(!env.KTC_PERF_READONLY_DB_CONFIRMED||env.KTC_PERF_READONLY_DB_CONFIRMED!=='YES')throw Error('Dedicated SQL read-only account confirmation required');
 const fields=['HOST','USER','PASSWORD','NAME'];
 if(fields.some(k=>!env['KTC_PERF_DB_'+k]))throw Error('Missing dedicated KTC_PERF_DB_* connection variables');
 const mysql=require('../backend/node_modules/mysql2/promise');
 const db=await mysql.createConnection({host:env.KTC_PERF_DB_HOST,user:env.KTC_PERF_DB_USER,password:env.KTC_PERF_DB_PASSWORD,database:env.KTC_PERF_DB_NAME,port:Number(env.KTC_PERF_DB_PORT||4000),ssl:{rejectUnauthorized:true},connectTimeout:8000});
 try{
 const [identity]=await db.query({sql:'SELECT DATABASE() AS db_name',timeout:5000});
 if(identity[0].db_name!==env.KTC_PERF_DB_NAME)throw Error('Database identity mismatch');
 const date=env.KTC_PERF_DATE||new Date().toISOString().slice(0,10);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('Invalid KTC_PERF_DATE');
 const cases=[
 ['ping','SELECT 1 AS ok',[]],
 ['approved-day','SELECT id,work_date,process_id FROM production_reports WHERE work_date=? ORDER BY id DESC LIMIT 200',[date]],
 ['pending-day','SELECT id,work_date,process_id FROM production_reports_temp WHERE work_date=? ORDER BY id DESC LIMIT 200',[date]],
 ['approved-month','SELECT id,work_date,process_id FROM production_reports WHERE work_date>=DATE_SUB(?,INTERVAL 30 DAY) AND work_date<=? ORDER BY work_date DESC,id DESC LIMIT 200',[date,date]],
 ['worker-master','SELECT id FROM workers ORDER BY id LIMIT 200',[]],
 ['standard-master','SELECT id FROM product_standards ORDER BY id LIMIT 200',[]],
 ['machine-master','SELECT id FROM machines ORDER BY id LIMIT 200',[]]
 ];
 const results=[];
 for(const [name,sql,params] of cases){
 let plan=null;
 if(name!=='ping'){
 const [rows]=await db.query({sql:'EXPLAIN '+sql,values:params,timeout:5000});
 plan=rows.map(r=>({id:r.id,estimatedRows:r.estRows,operator:r.task,access:r.access_object,extra:r.operator_info}));
 }
 const times=[];
 for(let i=0;i<10;i++){const t=performance.now();await db.query({sql,values:params,timeout:5000});times.push(round(performance.now()-t));await sleep(100);}
 results.push({name,count:times.length,p50Ms:pct(times,.5),p95Ms:pct(times,.95),maxMs:Math.max(...times),plan});
 }
 return {readOnlyAttested:true,concurrency:1,samplesPerQuery:10,results,note:'Client round-trip including result transfer; EXPLAIN estimates only, not EXPLAIN ANALYZE. RU/CPU/lock telemetry requires TiDB Dashboard.'};
 }finally{await db.end();}
}
async function browser(){
 const {chromium}=require('../frontend/node_modules/@playwright/test');
 const b=await chromium.launch({headless:true});const results=[];
 const urls={main:env.KTC_PERF_MAIN_FE||'https://ktc-frontend.nan978971.workers.dev',test:env.KTC_PERF_TEST_FE||'https://ktc-fe-test.nan978971.workers.dev'};
 try{
 for(const [name,base] of Object.entries(urls)){
 const url=new URL(base);
 if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('Invalid frontend origin');
 for(const profile of ['desktop','mobile']){
 for(let i=0;i<3;i++){
 const ctx=await b.newContext({viewport:profile==='mobile'?{width:390,height:844}:{width:1366,height:768},isMobile:profile==='mobile',hasTouch:profile==='mobile'});
 try{
 const page=await ctx.newPage();let errors=0,failedRequests=0;
 page.on('pageerror',()=>errors++);page.on('requestfailed',()=>failedRequests++);page.on('response',r=>{if(r.status()>=400)failedRequests++;});
 await page.addInitScript(()=>{window.__ktcPerf={lcp:null,cls:0,longTasks:0};for(const [type,fn] of [['largest-contentful-paint',es=>{for(const e of es)window.__ktcPerf.lcp=e.startTime;}],['layout-shift',es=>{for(const e of es)if(!e.hadRecentInput)window.__ktcPerf.cls+=e.value;}],['longtask',es=>{window.__ktcPerf.longTasks+=es.length;}]]){try{new PerformanceObserver(list=>fn(list.getEntries())).observe({type,buffered:true});}catch{}}});
 const response=await page.goto(url.origin+'/#/login',{waitUntil:'load',timeout:20000});await page.waitForTimeout(2000);
 const measurements=await page.evaluate(()=>{const n=performance.getEntriesByType('navigation')[0];const res=performance.getEntriesByType('resource');return {ttfbMs:n?.responseStart??null,domContentLoadedMs:n?.domContentLoadedEventEnd??null,loadMs:n?.loadEventEnd??null,lcpMs:window.__ktcPerf.lcp,cls:window.__ktcPerf.cls,longTasks:window.__ktcPerf.longTasks,resources:res.length,transferBytes:res.reduce((sum,x)=>sum+x.transferSize,0)};});
 results.push({environment:name,profile,iteration:i+1,status:response?.status()??null,errors,failedRequests,...measurements});
 if(response?.status()!==200||errors||failedRequests)throw Error('Frontend errors: '+name+'/'+profile);
 }finally{await ctx.close();}
 await sleep(1000);
 }
 }
 }
 return {results,note:'Three cold browser contexts per viewport; mobile viewport simulation only, no device/CPU/network throttling, no authenticated journeys or INP measurement.'};
 }finally{await b.close();}
}
async function main(){
 const mode=process.argv[2];
 if(!['db','browser','all'].includes(mode))throw Error('Usage: node scripts/performanceDiagnostics.cjs db|browser|all');
 let failed=false;
 for(const [key,fn] of [['database',database],['browser',browser]]){
 if(mode!=='all'&&mode!==(key==='database'?'db':'browser'))continue;
 try{report[key]=await fn();}catch(e){failed=true;report[key]={status:'FAIL_OR_BLOCKED',code:e.code||e.name};console.error(key+' blocked; check local credentials, dependencies and connectivity. Code:',e.code||e.name);}
 }
 report.finishedAt=new Date().toISOString();fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2));console.log('Diagnostics:',out);if(failed)process.exitCode=1;
}
main().catch(e=>{console.error(e.message);process.exitCode=2;});
