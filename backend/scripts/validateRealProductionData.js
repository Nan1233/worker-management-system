require('dotenv').config();
const db = require('../config/db');
const { calculateProductionMetrics } = require('../domain/productionCalculationEngine.cjs');
const formulaSettings = require('../services/formulaSettingsService');

const LIMIT = Math.max(10, Math.min(5000, Number(process.env.KTC_E2E_SAMPLE_LIMIT) || 1000));
const EPS = 0.011;
const issues = [];
const warnings = [];
const num = (v) => Number(v || 0);
const near = (a,b) => Math.abs(num(a)-num(b)) <= EPS;
function issue(report, code, detail){ issues.push({report_id:Number(report.id),worker_code:report.worker_code,work_date:String(report.work_date).slice(0,10),process_code:report.process_code,code,detail}); }
function warn(report, code, detail){ warnings.push({report_id:Number(report.id),worker_code:report.worker_code,work_date:String(report.work_date).slice(0,10),process_code:report.process_code,code,detail}); }

async function main(){
  await db.testConnection();
  const [reports] = await db.promise().query(`
    SELECT pr.*, w.worker_code, w.training_percent, p.process_code,
           COALESCE(ps.exclude_kqd_from_tt,0) exclude_kqd_from_tt
    FROM production_reports pr
    JOIN workers w ON w.id=pr.worker_id
    JOIN processes p ON p.id=pr.process_id
    LEFT JOIN product_standards ps ON ps.process_id=pr.process_id AND ps.product_code=pr.product_name
    WHERE pr.status='approved'
    ORDER BY pr.work_date DESC, pr.id DESC LIMIT ?`, [LIMIT]);
  const ids=reports.map(r=>Number(r.id));
  const details=new Map(ids.map(id=>[id,{defects:[],deductions:[],machineLines:[]} ]));
  if(ids.length){
    const ph=ids.map(()=>'?').join(',');
    const [defs]=await db.promise().query(`SELECT d.report_id,dt.defect_code,dt.defect_name,d.quantity FROM production_report_defects d JOIN defect_types dt ON dt.id=d.defect_type_id WHERE d.report_id IN (${ph})`,ids);
    const [deds]=await db.promise().query(`SELECT d.report_id,dt.deduction_code,dt.deduction_name,d.hours FROM production_report_deductions d JOIN deduction_types dt ON dt.id=d.deduction_type_id WHERE d.report_id IN (${ph})`,ids);
    const [lines]=await db.promise().query(`SELECT * FROM production_report_machine_lines WHERE report_id IN (${ph})`,ids);
    defs.forEach(x=>details.get(Number(x.report_id))?.defects.push(x));
    deds.forEach(x=>details.get(Number(x.report_id))?.deductions.push(x));
    lines.forEach(x=>details.get(Number(x.report_id))?.machineLines.push(x));
  }
  const settingsByDate = new Map();
  const today = new Date().toISOString().slice(0,10);
  for(const report of reports){
    const d=details.get(Number(report.id)); report.defects=d.defects; report.machineLines=d.machineLines;
    const defectSum=d.defects.reduce((s,x)=>s+num(x.quantity),0);
    const deductionSum=d.deductions.reduce((s,x)=>s+num(x.hours),0);
    if(d.defects.length && defectSum !== num(report.tt_ng)) issue(report,'NG_DETAIL_MISMATCH',`tt_ng=${report.tt_ng}, detail=${defectSum}`);
    if(d.deductions.length && !near(deductionSum,report.deduction_time)) issue(report,'DEDUCTION_DETAIL_MISMATCH',`deduction_time=${report.deduction_time}, detail=${deductionSum}`);
    if(num(report.total_time)>12.001 || num(report.actual_time)>12.001) issue(report,'TIME_OVER_12H',`total=${report.total_time}, actual=${report.actual_time}`);
    const date=String(report.work_date).slice(0,10); if(date>today) issue(report,'FUTURE_WORK_DATE',date);
    if(!report.entry_date) warn(report,'MISSING_ENTRY_DATE','entry_date is null');
    if(num(report.standard_output)<=0) warn(report,'MISSING_STANDARD',`standard=${report.standard_output}`);
    const countedNg=d.defects.length ? d.defects.reduce((s,x)=>s+(Number(report.exclude_kqd_from_tt)===1 && String(x.defect_code).toUpperCase()==='KQD'?0:num(x.quantity)),0) : num(report.tt_ng);
    const expectedEntered=num(report.tt_ok)+countedNg;
    if(!near(report.actual_output,expectedEntered)) issue(report,'ACTUAL_OUTPUT_MISMATCH',`actual_output=${report.actual_output}, expected=${expectedEntered}`);
    if(!settingsByDate.has(date)) settingsByDate.set(date, await formulaSettings.getSettingsMap(date));
    const settings=settingsByDate.get(date)[String(report.process_code).toUpperCase()] || settingsByDate.get(date).GLOBAL;
    const metrics=calculateProductionMetrics(report,settings);
    for(const [key,val] of Object.entries(metrics)) if(typeof val==='number' && !Number.isFinite(val)) issue(report,'NON_FINITE_METRIC',key);
  }
  const [[dup]] = await db.promise().query(`SELECT COUNT(*) c FROM (SELECT source_temp_id FROM production_reports WHERE source_temp_id IS NOT NULL GROUP BY source_temp_id HAVING COUNT(*)>1) x`);
  if(Number(dup.c)>0) issues.push({code:'DUPLICATE_SOURCE_TEMP',detail:String(dup.c)});
  const summary={success:issues.length===0,sampled:reports.length,issues:issues.length,warnings:warnings.length,issue_samples:issues.slice(0,50),warning_samples:warnings.slice(0,50)};
  console.log(JSON.stringify(summary,null,2));
  if(issues.length) process.exitCode=1;
  await db.closePool().catch(()=>{});
}
main().catch(async e=>{console.error('[KTC] Real-data E2E validation failed:',e);process.exitCode=1;await db.closePool().catch(()=>{});});
