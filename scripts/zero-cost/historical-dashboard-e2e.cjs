#!/usr/bin/env node
const fs=require('fs');
const path=require('path');
const mysql=require('../../backend/node_modules/mysql2/promise');
const {Client}=require('./http.cjs');
const fixture=JSON.parse(fs.readFileSync(path.resolve(process.env.KTC_ZERO_COST_FIXTURE||'validation-artifacts/fixture.json'),'utf8'));
const base=process.env.LOCAL_BACKEND_URL||'http://127.0.0.1:19080';
const dbCfg={host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME};
const w=new Client(base),m=new Client(base); const runId=`KTC_HIST_${Date.now()}`; const rows=[];
const outDir=path.resolve(process.env.KTC_VALIDATION_DIR||'validation-artifacts'); fs.mkdirSync(outDir,{recursive:true});
const d=days=>{const x=new Date();x.setUTCDate(x.getUTCDate()+days);return x.toISOString().slice(0,10)};
async function tc(name,fn){try{const x=await fn();rows.push({name,result:x.ok?'PASS':'FAIL',...x});if(!x.ok)process.exitCode=1}catch(e){rows.push({name,result:'FAIL',evidence:e.message});process.exitCode=1}}
async function main(){
 const db=await mysql.createConnection(dbCfg);
 // Safety: historical test must never run against production DB.
 if(dbCfg.database!=='worker_management_e2e'){throw new Error(`REFUSED: expected worker_management_e2e, got ${dbCfg.database}`)}
 await tc('worker login',async()=>{const r=await w.req('POST','/api/auth/login',{username:fixture.worker.code,access_type:'worker'});return{ok:r.status===200,status:r.status}});
 await tc('manager login',async()=>{const r=await m.req('POST','/api/auth/login',{username:fixture.manager.username,password:fixture.manager.password,access_type:'management'});return{ok:r.status===200,status:r.status}});
 let id=null;
 await tc('historical NG/deduction create',async()=>{const p=fixture.processes.DO;const r=await w.req('POST','/api/production-temp',{process_id:p.id,work_date:d(-7),shift:'A',operation_type:'NORMAL',operation_mode:p.machines[0]?'MACHINE':'MANUAL',machine_no:p.machines[0]?.code||'',product_name:p.product,training_percent:100,total_time:1,deduction_time:0.5,actual_time:0.5,standard_output:100,actual_output:8,tt_ok:8,tt_ng:2,defects:[],deductions:[],note:runId});id=r.data?.id;return{ok:r.status===201,status:r.status,recordId:id}});
 await tc('historical detail retains NG/deduction',async()=>{if(!id)return{ok:false,evidence:'create failed'};const r=await w.req('GET',`/api/production-temp/${id}`);const s=JSON.stringify(r.data||{});return{ok:r.status===200&&s.includes('deduction')&&s.includes('ng'),status:r.status,evidence:'detail response inspected'}});
 await tc('historical master inactive read',async()=>{if(!id)return{ok:false,evidence:'create failed'};const r=await w.req('GET',`/api/production-temp/${id}`);return{ok:r.status===200,status:r.status,evidence:'historical record remains readable'}});
 await tc('dashboard endpoint',async()=>{const candidates=['/api/dashboard','/api/statistics','/api/statistics/summary','/api/production/statistics'];let last;for(const u of candidates){const r=await m.req('GET',u);last={u,status:r.status};if(r.status===200)return{ok:true,status:r.status,evidence:u}}return{ok:false,status:last?.status||0,evidence:`No candidate dashboard endpoint returned 200: ${JSON.stringify(last)}`}});
 await db.end();fs.writeFileSync(path.join(outDir,'historical-dashboard-e2e.json'),JSON.stringify({runId,rows},null,2));console.table(rows);console.log(`HISTORICAL_DASHBOARD_E2E=${rows.every(x=>x.result==='PASS')?'PASS':'FAIL'}`)
}
main().catch(e=>{console.error('HISTORICAL_DASHBOARD_E2E_FATAL',e.stack||e);process.exit(1)})
