#!/usr/bin/env node
'use strict';
// KTC real HTTP performance runner. No business writes, no login storm.
const fs=require('node:fs'), path=require('node:path'), assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const sleep=ms=>new Promise(r=>setTimeout(r,Math.max(0,ms)));
const E=process.env;
const n=(name,def,min,max)=>{const v=Number(E[name]??def);if(!Number.isInteger(v)||v<min||v>max)throw Error(name+' must be '+min+'..'+max);return v;};
const p=(a,q)=>a.length?[...a].sort((x,y)=>x-y)[Math.ceil(a.length*q)-1]:null;
const day=E.KTC_PERF_DATE||new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const origins={main:{api:'https://ktc-backend.nan978971.workers.dev',fe:'https://ktc-frontend.nan978971.workers.dev'},test:{api:'https://ktc-be-test.nan978971.workers.dev',fe:'https://ktc-fe-test.nan978971.workers.dev'}};
function origin(value,isolated){
 const u=new URL(value);
 if(u.username||u.password||u.pathname!=='/'||u.search||u.hash||!(u.protocol==='https:'||(['localhost','127.0.0.1','[::1]'].includes(u.hostname)&&u.protocol==='http:')))throw Error('Expected HTTPS origin or local loopback');
 if(isolated&&(Object.values(origins).some(x=>[x.api,x.fe].includes(u.origin))||u.hostname.endsWith('.nan978971.workers.dev')))throw Error('Full profile refuses known live Workers; use a separately provisioned isolated deployment');
 return u.origin;
}
const mk=(name,route,role='public',budget=500,extra={})=>({name,route,role,budget,...extra});
const catalog=()=>[
 mk('frontend-login','/','public',2500,{fe:true}),
 mk('version','/api/version','public',500),
 mk('health-live','/api/health/live','public',500,{validate:x=>x?.status==='live'}),
 mk('health-ready','/api/health/ready','public',800,{validate:x=>x?.status==='ready'&&x?.schemaReady===true}),
 mk('worker-permissions','/api/permissions/me','worker'),
 mk('machines','/api/machines','worker'),
 mk('standards','/api/product-standards','worker',1000),
 mk('worker-notifications','/api/system/notifications/unread-count','worker'),
 mk('worker-self','/api/workers/me','worker'),
 mk('worker-daily-hours','/api/production-temp/daily-hours?date='+encodeURIComponent(day),'worker',1000),
 mk('worker-notification-list','/api/system/notifications','worker',1000),
 mk('worker-history','/api/production-temp/my','worker',1000),
 mk('manager-permissions','/api/permissions/me','manager'),
 mk('pending','/api/production-temp/pending','manager',1000),
 mk('approved','/api/production?limit=20&page=1','manager',1000),
 mk('temp-approved','/api/production-temp/approved','manager',1000),
 mk('temp-dates','/api/production-temp/dates','manager',1000),
 mk('manager-reports','/api/manager/reports','manager',1000),
 mk('excel-status','/api/reports/export-excel/company-status','manager',500),
 mk('report-dates','/api/production/dates','manager',1000),
 mk('dashboard','/api/dashboard/summary','manager',2000),
 mk('excel-day','/api/reports/export-excel/company-data?date='+encodeURIComponent(day),'manager',5000,{heavy:true,validate:x=>Boolean(x?.data?.processes)})
];
function tokens(key){
 let v=E['KTC_PERF_'+key.toUpperCase()+'_TOKENS'];
 if(!v)return {worker:[],manager:[]};
 let obj=JSON.parse(v);
 for(const role of ['worker','manager'])if(obj[role]!==undefined&&(!Array.isArray(obj[role])||obj[role].some(t=>typeof t!=='string'||!t||/[\r\n]/.test(t))))throw Error('Invalid token list for '+role);
 return {worker:obj.worker||[],manager:obj.manager||[]};
}
function stats(samples,budget){
 const a=samples.map(x=>x.ms), bad=samples.filter(x=>!x.ok);
 return {count:a.length,failures:bad.length,statusCounts:samples.reduce((o,x)=>(o[x.status]=(o[x.status]||0)+1,o),{}),p50Ms:p(a,.5),p95Ms:p(a,.95),p99Ms:p(a,.99),maxMs:a.length?Math.max(...a):null,meanBytes:a.length?Math.round(samples.reduce((s,x)=>s+x.bytes,0)/a.length):null,budgetMs:budget,verdict:bad.length?'FAIL':a.length<20?'INSUFFICIENT':p(a,.95)<=budget?'PASS':'FAIL'};
}
function inventory(){
 const dir=path.resolve(__dirname,'../backend/routes');
 return fs.readdirSync(dir).filter(x=>x.endsWith('.js')).flatMap(file=>{
 const src=fs.readFileSync(path.join(dir,file),'utf8');
 return [...src.matchAll(/\brouter\.(get|post|put|patch|delete|head|options)\s*\(\s*(['"])(.*?)\2/gs)].map(m=>({file,method:m[1].toUpperCase(),relativeRoute:m[3]}));
 });
}
function compare(main,test){
 const out=[];
 for(const a of main.stages) {
 const b=test.stages.find(x=>x.name===a.name);if(!b)continue;
 for(const [name,x] of Object.entries(a.routes)){
 const y=b.routes[name];if(!y)continue;
 const delta=x.p95Ms>0&&y.p95Ms!==null?Math.round((y.p95Ms/x.p95Ms-1)*1000)/10:null;
 out.push({stage:a.name,route:name,mainP95:x.p95Ms,testP95:y.p95Ms,deltaPercent:delta,verdict:x.verdict==='FAIL'||y.verdict==='FAIL'?'FAIL':x.count<20||y.count<20||delta===null?'INSUFFICIENT':delta>5?'REGRESSION':'PASS'});
 }}
 return out;
}
async function request(env,c,user){
 const started=performance.now();
 try{
 const h={accept:c.fe?'text/html':'application/json'};
 if(!c.fe&&c.role!=='public')h.authorization='Bearer '+env.tokens[c.role][user%env.tokens[c.role].length];
 const res=await fetch((c.fe?env.fe:env.api)+c.route,{headers:h,method:'GET',redirect:'error',signal:AbortSignal.timeout(8000)});
 const body=await res.text();let data=null;try{data=JSON.parse(body);}catch{}
 const ok=res.status===200&&(c.fe?body.includes('<'):data!==null&&data.success!==false&&(!c.validate||c.validate(data)));
 return {ok,status:res.status,ms:Math.round(performance.now()-started),bytes:Buffer.byteLength(body)};
 }catch(e){return {ok:false,status:e.name==='TimeoutError'?'TIMEOUT':'NETWORK',ms:Math.round(performance.now()-started),bytes:0};}
}
async function runStage(env,stage,state,cases,rate){
 const start=performance.now(),end=start+stage.seconds*1000,results={},served=new Set();
 let cursor=0,next=start,stageStop='';
 async function one(user,c){
 if(state.stop||stageStop||state.used>=state.budget)return;
 const now=performance.now(),slot=Math.max(now,next);
 if(slot>=end)return;
 next=slot+1000/rate;
 await sleep(slot-now);
 if(state.stop||stageStop||performance.now()>=end||state.used>=state.budget)return;
 state.used++;
 const r=await request(env,c,user);served.add(user);
 (results[c.name]??=[]).push(r);
 if(!r.ok){
 // Stop globally on a single unexpected response, including 429, 5xx and timeouts.
 state.stop=env.name+'/'+stage.name+'/'+c.name+': '+r.status;
 }
 }
 await Promise.all(Array.from({length:stage.users},(_,user)=>(async()=>{
 // Distribute starts; global scheduler caps request arrival rate.
 await sleep(Math.min(1000, user*3));
 while(!state.stop&&!stageStop&&performance.now()<end&&state.used<state.budget){
 const c=stage.preflight?cases[cursor++]:cases[(cursor++)%cases.length];
 if(!c)break;
 await one(user,c);
 if(!stage.preflight)await sleep(stage.thinkMs);
 }
 })()));
 const elapsed=Math.max(.001,(performance.now()-start)/1000);
 const routes=Object.fromEntries(Object.entries(results).map(([name,a])=>[name,stats(a,cases.find(c=>c.name===name).budget)]));
 const flat=Object.values(results).flat();
 if(state.used>=state.budget&&!state.stop)state.stop='Global request budget exhausted';
 if(!state.stop&&Object.values(routes).some(x=>x.verdict==='FAIL'))state.stop=env.name+'/'+stage.name+': P95 budget exceeded';
 return {name:stage.name,targetUsers:stage.users,usersServed:served.size,elapsedSeconds:Math.round(elapsed*10)/10,requests:flat.length,rps:Math.round(flat.length/elapsed*10)/10,routes,stop:state.stop||null};
}
async function runEnv(env,stages,state,rate){
 const all=catalog(),available=all.filter(c=>c.role==='public'||env.tokens[c.role].length);
 const result={name:env.name,api:env.api,fe:env.fe,skipped:all.filter(c=>!available.includes(c)).map(c=>({route:c.name,reason:'missing role token'})),distinctTokens:{worker:new Set(env.tokens.worker).size,manager:new Set(env.tokens.manager).size},stages:[]};
 // Preflight all included routes (including expensive Excel once). Bulk workload excludes FE and heavy export.
 const pre=await runStage(env,{name:'preflight',users:1,seconds:240,thinkMs:0,preflight:true},state,available,rate);result.stages.push(pre);
 if(!state.stop&&pre.requests!==available.length)state.stop='Preflight incomplete';
 const load=available.filter(c=>!c.fe&&!c.heavy&&c.name!=='health-ready');
 for(const stage of stages){if(state.stop)break;const r=await runStage(env,stage,state,load,rate);result.stages.push(r);console.log(env.name,stage.name,'served',r.usersServed,'requests',r.requests,'rps',r.rps,r.stop||'');}
 return result;
}
async function main(){
 if(process.argv.includes('--self-test')){
 assert.equal(p([1,2,3,4],.95),4);assert.equal(stats([{ok:true,status:200,ms:1,bytes:4}],500).verdict,'INSUFFICIENT');
 assert.throws(()=>origin(origins.test.api,true));assert.throws(()=>origin('https://user:pass@example.org',false));
 assert.equal(catalog().length,22);assert(inventory().length>0);console.log('KTC_PERF_SELF_TEST PASS');return;
 }
 const mode=E.KTC_PERF_MODE||'quick';if(!['quick','full','spike','soak'].includes(mode))throw Error('Unknown mode');
 const isolated=mode!=='quick';
 if(isolated&&E.KTC_PERF_ISOLATED_DB_CONFIRMED!=='YES')throw Error('Confirm separately provisioned isolated DB for both targets; live/shared production DB is forbidden in full/spike/soak');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day))throw Error('Invalid KTC_PERF_DATE');
 const rate=n('KTC_PERF_RPS',isolated?20:2,1,isolated?50:2);
 const budget=n('KTC_PERF_TOTAL_REQUEST_BUDGET',isolated?30000:300,30,isolated?100000:300);
 const envs=['main','test'].map(name=>{
 const k='KTC_PERF_'+name.toUpperCase();
 if(isolated&&(!E[k+'_API']||!E[k+'_FE']))throw Error('Explicit isolated origins required');
 return {name,api:origin(E[k+'_API']||origins[name].api,isolated),fe:origin(E[k+'_FE']||origins[name].fe,isolated),tokens:tokens(name)};
 });
 if(envs[0].api===envs[1].api||envs[0].fe===envs[1].fe)throw Error('MAIN and TEST must be different origins');
 // Do not allow an uncredentialed 400-user run to masquerade as a business test.
 if(isolated&&envs.some(e=>!e.tokens.worker.length||!e.tokens.manager.length))throw Error('Full profiles require worker and manager fixture tokens for both deployments');
 const stage=(users,seconds,name='load-'+users)=>({name,users,seconds,thinkMs:15000});
 const stages=mode==='quick'?[{...stage(1,15),thinkMs:1000},{...stage(5,20),thinkMs:2000},{...stage(10,20),thinkMs:3000}]:
 mode==='full'?[stage(1,30),stage(10,30),stage(25,45),stage(50,60),stage(100,60),stage(150,60),stage(200,60),stage(250,60),stage(300,90),stage(350,90),stage(400,180),stage(1,30,'recovery')]:
 mode==='spike'?[stage(10,30),stage(400,120,'spike-400'),stage(1,60,'recovery')]:
 [stage(400,n('KTC_PERF_SOAK_SECONDS',600,60,3600),'soak-400'),stage(1,60,'recovery')];
 const state={used:0,budget,stop:''}, report={date:day,mode,rateCap:rate,globalBudget:budget,startedAt:new Date().toISOString(),environments:[],routeInventory:inventory(),notes:['GET business paths only; access/audit logging may occur.','Token reuse is not proof of 400 distinct authenticated identities.','Heavy Excel path preflight only; not a load certification.','Static FE HTTP is not browser LCP.','Inventory lists candidate literal router routes, not verified coverage.']};
 const out=path.resolve(E.KTC_PERF_OUTPUT||'validation-artifacts/performance-400.json');fs.mkdirSync(path.dirname(out),{recursive:true});
 try{
 for(const env of envs){if(state.stop)break;report.environments.push(await runEnv(env,stages,state,rate));if(!state.stop&&env.name==='main')await sleep(isolated?30000:5000);}
 }finally{
 report.requests=state.used;report.stop=state.stop||null;report.finishedAt=new Date().toISOString();
 report.comparison=report.environments.length===2?compare(...report.environments):[];
 report.verdict=state.stop||report.comparison.some(x=>['FAIL','REGRESSION'].includes(x.verdict))?'FAIL':'PARTIAL';
 fs.writeFileSync(out,JSON.stringify(report,null,2));console.log('Report:',out,'verdict:',report.verdict);
 }
 if(report.verdict==='FAIL')process.exitCode=1;
}
main().catch(e=>{console.error('KTC_PERF_BLOCKED:',e.message);process.exitCode=2;});
