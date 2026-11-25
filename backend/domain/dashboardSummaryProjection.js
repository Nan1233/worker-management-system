'use strict';
const {calculateStoredProductionMetrics,safeRatio,asNumber}=require('../../shared/productionMetricPrimitives.cjs');
const num=value=>asNumber(value)??0;
const percent=(a,b)=>{const rate=safeRatio(a,b);return rate===null?0:rate*100;};
function groupByReport(rows) {
  const result=new Map();
  for(const row of rows){const id=String(row.report_id);if(!result.has(id))result.set(id,[]);result.get(id).push(row);}
  return result;
}
function bucket(map,key,initial){if(!map.has(key))map.set(key,initial);return map.get(key);}
function addOutput(target,metrics){
  target.report_count+=1;
  target.ok+=num(metrics.ok);
  target.ng+=num(metrics.allNg);
}
function projectDashboardSummary({from,to,processes,pendingRows,reports,lines,deductions,machineRows,machinePlanRows}){
  const lineMap=groupByReport(lines),deductionMap=groupByReport(deductions);
  const byProcess=new Map(),byDay=new Map(),byShift=new Map(),byPlan=new Map(),byWorker=new Map(),byProduct=new Map();
  let totalOk=0,totalNg=0,workerHours=0,earnedHours=0,missingOutput=0,missingPlan=0,missingHours=0;
  for(const report of reports){
    const id=String(report.id),machine_lines=lineMap.get(id)||[],workerDeductions=deductionMap.get(id)||[];
    const metrics=calculateStoredProductionMetrics({...report,machine_lines,deductions:workerDeductions});
    const pid=Number(report.process_id),wid=Number(report.worker_id),shift=String(report.shift||'').trim()||'Chưa xác định';
    const initial={report_count:0,ok:0,ng:0};
    addOutput(bucket(byProcess,pid,{process_id:pid,process_code:report.process_code,process_name:report.process_name,...initial}),metrics);
    addOutput(bucket(byDay,report.work_date,{work_date:report.work_date,...initial}),metrics);
    addOutput(bucket(byShift,shift,{shift,...initial}),metrics);
    totalOk+=num(metrics.ok);totalNg+=num(metrics.allNg);
    if(metrics.ok==null||metrics.allNg==null)missingOutput++;
    if(metrics.plannedOutput==null)missingPlan++;
    if(metrics.actualTime==null)missingHours++;
    workerHours+=num(metrics.actualTime);
    const plan=bucket(byPlan,pid,{process_id:pid,planned_quantity:0,planned_minutes:0,plan_count:0,missing_plan_count:0});
    if(metrics.plannedOutput==null)plan.missing_plan_count++;
    else{plan.planned_quantity+=metrics.plannedOutput;plan.plan_count++;}
    plan.planned_minutes+=num(metrics.actualTime)*60;
    const worker=bucket(byWorker,wid,{worker_id:wid,worker_code:report.worker_code,full_name:report.full_name,report_count:0,actual_output:0,planned_output:0,worker_hours:0,missing_plan_count:0,missing_output_count:0});
    worker.report_count++;worker.actual_output+=num(metrics.adjustedOutput);worker.planned_output+=num(metrics.plannedOutput);worker.worker_hours+=num(metrics.actualTime);
    if(metrics.plannedOutput==null)worker.missing_plan_count++;
    if(metrics.adjustedOutput==null)worker.missing_output_count++;
    for(const line of machine_lines)earnedHours+=num(line.earned_standard_hours);
    // Product summary stays line-based, never repeats a multi-line report's parent output.
    for(const line of machine_lines){
      const code=String(line.product_code||'').trim();if(!code)continue;
      const item=bucket(byProduct,code,{product_code:code,quantity:0,planned_quantity:0,ok:0,ng:0,ids:new Set(),missing_plan_count:0});
      const single=calculateStoredProductionMetrics({...report,machine_lines:[line],deductions:machine_lines.length===1?workerDeductions:[],deduction_time:machine_lines.length===1?report.deduction_time:null,total_time:line.machine_time_hours,actual_time:null,tt_ok:line.ok_quantity,tt_ng:line.ng_quantity,actual_output:asNumber(line.ok_quantity)!==null&&asNumber(line.ng_quantity)!==null?num(line.ok_quantity)+num(line.ng_quantity):null,standard_output:line.standard_output});
      item.quantity+=num(single.adjustedOutput);item.ok+=num(single.ok);item.ng+=num(single.allNg);item.planned_quantity+=num(single.plannedOutput);if(single.plannedOutput==null)item.missing_plan_count++;item.ids.add(id);
    }
  }
  const machineSummary=machineRows.map(row=>({machine_id:Number(row.machine_id),machine_code:row.machine_code,run_count:num(row.run_count),machine_hours:num(row.machine_hours),maximum_output:num(row.maximum_output),counted_output:num(row.counted_output),ok:num(row.ok),ng:num(row.ng),efficiency_percent:percent(row.counted_output,row.maximum_output)}));
  const physical=machineSummary.reduce((sum,row)=>({machine_line_count:sum.machine_line_count+row.run_count,total_machine_hours:sum.total_machine_hours+row.machine_hours,maximum_output:sum.maximum_output+row.maximum_output,counted_output:sum.counted_output+row.counted_output,total_ok:sum.total_ok+row.ok,total_ng:sum.total_ng+row.ng}),{machine_line_count:0,total_machine_hours:0,maximum_output:0,counted_output:0,total_ok:0,total_ng:0});
  return {success:true,data:{
    from,to,pending_count:num(pendingRows[0]?.pending_count),approved_count:reports.length,total_ok:totalOk,total_ng:totalNg,ng_rate:percent(totalNg,totalOk+totalNg),processes,
    process_summary:[...byProcess.values()].sort((a,b)=>String(a.process_name).localeCompare(String(b.process_name),'vi')),
    plan_summary:[...byPlan.values()],daily_summary:[...byDay.values()].sort((a,b)=>String(a.work_date).localeCompare(String(b.work_date))),shift_summary:[...byShift.values()].sort((a,b)=>a.shift.localeCompare(b.shift)),
    product_summary:[...byProduct.values()].sort((a,b)=>b.quantity-a.quantity||a.product_code.localeCompare(b.product_code)).slice(0,8).map(({ids,...item})=>({...item,report_count:ids.size})),
    machine_performance:{machine_count:new Set(machineSummary.map(row=>row.machine_id)).size,...physical,efficiency_percent:percent(physical.counted_output,physical.maximum_output)},
    worker_performance:{worker_count:byWorker.size,actual_worker_hours:workerHours,earned_standard_hours:earnedHours,efficiency_percent:percent(earnedHours,workerHours)},
    worker_summary:[...byWorker.values()].sort((a,b)=>b.actual_output-a.actual_output||String(a.worker_code).localeCompare(String(b.worker_code))).map(row=>({...row,completion_percent:row.missing_plan_count||row.missing_output_count?null:percent(row.actual_output,row.planned_output)})),
    machine_summary:machineSummary,
    machine_plan_summary:machinePlanRows.map(row=>({machine_id:Number(row.machine_id),machine_code:String(row.machine_code||row.machine_id),planned_quantity:num(row.planned_quantity),planned_minutes:num(row.planned_minutes),plan_count:num(row.plan_count)})),
    data_quality:{missing_output_count:missingOutput,missing_plan_count:missingPlan,missing_worker_hours_count:missingHours}
  }};
}
module.exports={projectDashboardSummary};
