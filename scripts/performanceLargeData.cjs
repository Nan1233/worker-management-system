#!/usr/bin/env node
'use strict';
const mysql = require('../backend/node_modules/mysql2/promise');
const { performance } = require('node:perf_hooks');
const fs = require('node:fs');
const path = require('node:path');
const iterations = Number(process.env.KTC_PERF_DB_ITERATIONS || 200);
const budgetMs = Number(process.env.KTC_PERF_DB_P95_MS || 500);
if (!Number.isInteger(iterations) || iterations < 20 || iterations > 5000) throw new Error('KTC_PERF_DB_ITERATIONS must be 20..5000');
async function main() {
  if (!process.env.DB_HOST || !process.env.DB_USER || !process.env.DB_NAME) throw new Error('DB_HOST, DB_USER and DB_NAME are required');
  const db = await mysql.createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||4000),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,ssl:String(process.env.DB_SSL||'true').toLowerCase()!=='false'?{}:undefined});
  const queries={
    pending:`SELECT id, work_date, process_id, status FROM production_reports_temp WHERE status='pending' ORDER BY work_date DESC, id DESC LIMIT 100`,
    approved:`SELECT id, work_date, process_id, status FROM production_reports WHERE status <> 'deleted' ORDER BY work_date DESC, id DESC LIMIT 100`,
    workers:`SELECT id, worker_code, full_name FROM workers ORDER BY id DESC LIMIT 100`,
    standards:`SELECT id, process_id, product_code, machine_code FROM product_standards ORDER BY id DESC LIMIT 100`
  };
  const timings={};
  for(const [name,sql] of Object.entries(queries)){
    const samples=[];
    for(let i=0;i<iterations;i++){const t=performance.now();const [rows]=await db.query(sql);samples.push(performance.now()-t);if(!Array.isArray(rows))throw new Error(`${name} did not return rows`)}
    samples.sort((a,b)=>a-b);const p50=samples[Math.floor(samples.length*.5)],p95=samples[Math.floor(samples.length*.95)];
    timings[name]={p50Ms:+p50.toFixed(2),p95Ms:+p95.toFixed(2),maxMs:+Math.max(...samples).toFixed(2)};
    if(p95>budgetMs)throw new Error(`${name} p95 ${p95.toFixed(2)}ms exceeds ${budgetMs}ms`);
  }
  const [[counts]]=await db.query(`SELECT (SELECT COUNT(*) FROM workers) workers,(SELECT COUNT(*) FROM production_reports_temp) pending_reports,(SELECT COUNT(*) FROM production_reports) approved_reports,(SELECT COUNT(*) FROM product_standards) product_standards`);
  await db.end();
  const outDir=path.resolve(process.env.KTC_VALIDATION_DIR||'validation-artifacts');fs.mkdirSync(outDir,{recursive:true});
  const result={iterations,budgetMs,counts,timings,result:'PASS',generatedAt:new Date().toISOString()};fs.writeFileSync(path.join(outDir,'performance-large-data.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));console.log('KTC_PERFORMANCE_LARGE_DATA=PASS');
}
main().catch(e=>{console.error('KTC_PERFORMANCE_LARGE_DATA_FAIL',e.stack||e.message);process.exit(1)});
