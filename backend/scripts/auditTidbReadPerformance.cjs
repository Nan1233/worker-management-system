#!/usr/bin/env node
'use strict';

// Read-only TiDB performance audit. No DDL/DML. EXPLAIN ANALYZE executes the
// SELECT; opt in explicitly and run on a non-production clone first.
require('dotenv').config();
const { performance } = require('node:perf_hooks');
const db = require('../config/db');
const date = process.env.KTC_PERF_DATE;
const processId = Number(process.env.KTC_PERF_PROCESS_ID);
const workerId = Number(process.env.KTC_PERF_WORKER_ID);
const iterations = Number(process.env.KTC_PERF_ITERATIONS || 5);
if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !Number.isInteger(processId) || processId <= 0 || !Number.isInteger(workerId) || workerId <= 0) {
  console.error('Set KTC_PERF_DATE=YYYY-MM-DD, KTC_PERF_PROCESS_ID and KTC_PERF_WORKER_ID.');
  process.exit(2);
}
if (!Number.isInteger(iterations) || iterations < 2 || iterations > 30) {
  console.error('KTC_PERF_ITERATIONS must be 2..30');
  process.exit(2);
}
const cases = [
  { name: 'approved-by-date', sql: "SELECT pr.id,pr.work_date,pr.process_id FROM production_reports pr WHERE pr.work_date=? AND pr.status='approved' ORDER BY pr.created_at DESC LIMIT 100", params: [date] },
  { name: 'approved-by-date-process', sql: "SELECT pr.id,pr.work_date,pr.process_id FROM production_reports pr WHERE pr.work_date=? AND pr.process_id=? AND pr.status='approved' ORDER BY pr.created_at DESC LIMIT 100", params: [date,processId] },
  { name: 'approved-by-worker-date', sql: "SELECT pr.id,pr.work_date,pr.process_id FROM production_reports pr WHERE pr.worker_id=? AND pr.work_date=? AND pr.status='approved' ORDER BY pr.created_at DESC LIMIT 100", params: [workerId,date] },
  { name: 'pending-by-date-process', sql: "SELECT id,work_date,process_id FROM production_reports_temp WHERE work_date=? AND process_id=? ORDER BY id DESC LIMIT 100", params: [date,processId] },
  { name: 'monthly-excel-parent', sql: "SELECT pr.id,pr.worker_id,pr.process_id,pr.work_date FROM production_reports pr WHERE pr.work_date>=DATE_FORMAT(?,'%Y-%m-01') AND pr.work_date<DATE_ADD(DATE_FORMAT(?,'%Y-%m-01'),INTERVAL 1 MONTH) AND pr.process_id=? AND pr.status='approved' ORDER BY pr.work_date,pr.id LIMIT 1000", params: [date,date,processId] },
  { name: 'approved-split-filter', sql: "SELECT pr.id FROM production_reports pr WHERE pr.work_date=? AND pr.status='approved' AND NOT EXISTS (SELECT 1 FROM production_reports split_child WHERE JSON_UNQUOTE(JSON_EXTRACT(split_child.extra_data,'$.split_from_report_id'))=CAST(pr.id AS CHAR)) ORDER BY pr.created_at DESC LIMIT 100", params: [date] }
];
function quantile(a, p) { const s=[...a].sort((x,y)=>x-y);return s[Math.ceil(p*s.length)-1]; }
async function main() {
  const pool=db.promise();
  const indexes={};
  for (const table of ['production_reports','production_reports_temp','production_report_machine_lines','production_report_deductions','production_report_defects','machine_production_events']) {
    const [rows]=await pool.query('SELECT INDEX_NAME,COLUMN_NAME,SEQ_IN_INDEX,NON_UNIQUE FROM information_schema.statistics WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? ORDER BY INDEX_NAME,SEQ_IN_INDEX',[table]);
    indexes[table]=rows;
  }
  const results=[];
  for(const c of cases) {
    const [plan]=await pool.query('EXPLAIN '+c.sql,c.params);
    const samples=[];
    for(let i=0;i<iterations;i++) {
      const start=performance.now();
      const [rows]=await pool.query(c.sql,c.params);
      samples.push({ms:performance.now()-start,rows:rows.length});
    }
    let analyze=null;
    if(process.env.KTC_PERF_EXPLAIN_ANALYZE==='1') {
      const [detail]=await pool.query('EXPLAIN ANALYZE '+c.sql,c.params);
      analyze=detail;
    }
    results.push({name:c.name,sql:c.sql,params:c.params,rows:samples[0].rows,p50Ms:Number(quantile(samples.map(x=>x.ms),.5).toFixed(2)),p95Ms:Number(quantile(samples.map(x=>x.ms),.95).toFixed(2)),plan,analyze});
  }
  console.log(JSON.stringify({at:new Date().toISOString(),database:'current configured connection',iterations,indexes,results},null,2));
}
main().catch(e=>{console.error('Audit failed:',e.code||e.name,e.message);process.exitCode=1;}).finally(async()=>{if(typeof db.closePool==='function')await db.closePool();});
