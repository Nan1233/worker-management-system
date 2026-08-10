require('dotenv').config();
const db = require('../config/db');
const { calculateProductionMetrics } = require('../domain/productionCalculationEngine.cjs');
const formulaSettings = require('../services/formulaSettingsService');
const { calculateReportPerformance } = require('../services/machinePerformanceService');

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
    const [lines]=await db.promise().query(`SELECT * FROM production_report_machine_lines WHERE report_id IN (${ph}) ORDER BY report_id,sort_order,id`,ids);
    const lineIds=lines.map(x=>Number(x.id));
    const machineDefectsByLine=new Map(lineIds.map(id=>[id,[]]));
    if(lineIds.length){
      const lph=lineIds.map(()=>'?').join(',');
      const [machineDefs]=await db.promise().query(`SELECT machine_line_id,defect_type_id,defect_code,defect_name,quantity FROM production_report_machine_defects WHERE machine_line_id IN (${lph}) ORDER BY machine_line_id,id`,lineIds);
      machineDefs.forEach(x=>machineDefectsByLine.get(Number(x.machine_line_id))?.push(x));
    }
    defs.forEach(x=>details.get(Number(x.report_id))?.defects.push(x));
    deds.forEach(x=>details.get(Number(x.report_id))?.deductions.push(x));
    lines.forEach(x=>{ x.defects=machineDefectsByLine.get(Number(x.id)) || []; details.get(Number(x.report_id))?.machineLines.push(x); });
  }
  const settingsByDate = new Map();
  const today = new Date().toISOString().slice(0,10);
  const coverage={processes:new Set(),workers:new Set(),dates:new Set(),multiMachine:0,zeroTraining:0,kqdExcluded:0,withDefects:0,withDeductions:0};
  for(const report of reports){
    const d=details.get(Number(report.id)); report.defects=d.defects; report.machineLines=d.machineLines;
    Object.assign(report, calculateReportPerformance({ report, machineLines:d.machineLines }));
    coverage.processes.add(String(report.process_code||'')); coverage.workers.add(String(report.worker_code||'')); coverage.dates.add(String(report.work_date).slice(0,10));
    if(d.machineLines.length>1) coverage.multiMachine += 1;
    if(Number(report.training_percent)===0) coverage.zeroTraining += 1;
    if(Number(report.exclude_kqd_from_tt)===1) coverage.kqdExcluded += 1;
    if(d.defects.length) coverage.withDefects += 1;
    if(d.deductions.length) coverage.withDeductions += 1;
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
    if(!near(metrics.actualTime, report.actual_time)) issue(report,'ACTUAL_TIME_CONTRACT_MISMATCH',`stored=${report.actual_time}, calculated=${metrics.actualTime}`);
    if(metrics.hasMachinePerformance){
      if(!near(metrics.adjustedOutput, report.machinePerformance?.counted_output)) issue(report,'MACHINE_COUNTED_OUTPUT_MISMATCH',`engine=${metrics.adjustedOutput}, aggregate=${report.machinePerformance?.counted_output}`);
      if(Number(report.machinePerformance?.machine_count||0)!==d.machineLines.length) issue(report,'MACHINE_COUNT_MISMATCH',`aggregate=${report.machinePerformance?.machine_count}, lines=${d.machineLines.length}`);
    }
  }
  const [[dup]] = await db.promise().query(`SELECT COUNT(*) c FROM (SELECT source_temp_id FROM production_reports WHERE source_temp_id IS NOT NULL GROUP BY source_temp_id HAVING COUNT(*)>1) x`);
  if(Number(dup.c)>0) issues.push({code:'DUPLICATE_SOURCE_TEMP',detail:String(dup.c)});
  if(reports.length){
    if(coverage.processes.size<2) warnings.push({code:'LOW_PROCESS_COVERAGE',detail:`Chỉ có ${coverage.processes.size} công đoạn trong mẫu`});
    if(coverage.dates.size<3) warnings.push({code:'LOW_DATE_COVERAGE',detail:`Chỉ có ${coverage.dates.size} ngày trong mẫu`});
    if(coverage.multiMachine===0) warnings.push({code:'NO_MULTI_MACHINE_SAMPLE',detail:'Mẫu chưa có báo cáo nhiều máy'});
    if(coverage.zeroTraining===0) warnings.push({code:'NO_ZERO_TRAINING_SAMPLE',detail:'Mẫu chưa có worker 0% học việc'});
    if(coverage.withDefects===0) warnings.push({code:'NO_DEFECT_SAMPLE',detail:'Mẫu chưa có báo cáo NG'});
    if(coverage.withDeductions===0) warnings.push({code:'NO_DEDUCTION_SAMPLE',detail:'Mẫu chưa có báo cáo trừ giờ'});
  }
  const summary={success:issues.length===0,sampled:reports.length,coverage:{processes:coverage.processes.size,workers:coverage.workers.size,dates:coverage.dates.size,multiMachine:coverage.multiMachine,zeroTraining:coverage.zeroTraining,kqdExcluded:coverage.kqdExcluded,withDefects:coverage.withDefects,withDeductions:coverage.withDeductions},issues:issues.length,warnings:warnings.length,issue_samples:issues.slice(0,50),warning_samples:warnings.slice(0,50)};
  console.log(JSON.stringify(summary,null,2));
  if(issues.length) process.exitCode=1;
  await db.closePool().catch(()=>{});
}
main().catch(async e=>{console.error('[KTC] Real-data E2E validation failed:',e);process.exitCode=1;await db.closePool().catch(()=>{});});
