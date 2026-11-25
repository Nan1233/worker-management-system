'use strict';
const { PROCESS_CODES, normalizeYearMonth }=require('./monthlyExcelContract.cjs');
const { assertApprovedDatabasePayload }=require('./monthlyWorkbookReportData.cjs');
function processRows(payload) {
  const processes = payload?.processes || {};
  return PROCESS_CODES.map((code) => {
    const data = processes[code] || {};
    return { processCode: code, processName: data.processName || data.process_name || code, data };
  });
}

const { mergeDefects, normalizeDeductions } = require('./reportDetailNormalizer.cjs');

function hydrateReportDetails(processData) {
  const types=Array.isArray(processData?.deductionTypes)?processData.deductionTypes:[];
  for(const report of Array.isArray(processData?.reports)?processData.reports:[]){
    const raw=report.rawDetail||{};
    const deductionRows=Array.isArray(raw.deductionRows)?raw.deductionRows:(report.deductions||[]);
    const defectRows=Array.isArray(raw.defectRows)?raw.defectRows:(report.defects||[]);
    // Never recover approved details from editable temporary reports.
    report.deductions=normalizeDeductions(deductionRows,report,report.machineLines||[],types);
    report.defects=mergeDefects(report,defectRows,report.machineLines||[]);
    report.excelDeductionsSource='approved_snapshot';
    report.excelDefectsSource='approved_snapshot';
  }
}

function gcSplitMetadata(report) {
  const value = report?.extra_data ?? report?.extraData ?? report?.rawDetail?.extra_data;
  if (value && typeof value === 'object') return value;
  if (typeof value === 'string') {
    try { return JSON.parse(value) || {}; } catch (_) { return {}; }
  }
  return {};
}

// Remove only verified split parents. Never divide historical machine totals.
function filterVerifiedGcSplitParents(reports) {
  const byId = new Map(reports.map((report) => [String(report?.id), report]));
  return reports.filter((report) => {
    const extra = gcSplitMetadata(report);
    if (extra.split_status !== 'SPLIT_PARENT') return true;
    const childIds = extra.split_into_report_ids;
    if (!Array.isArray(childIds) || !childIds.length || new Set(childIds.map(String)).size!==childIds.length || childIds.map(String).includes(String(report.id))) return true;
    const children = childIds.map((id) => byId.get(String(id)));
    if (children.some((child) => !child)) return true;
    if (children.some((child) => String(gcSplitMetadata(child).split_from_report_id) !== String(report.id))) return true;
    for (const key of ['tt_ok', 'tt_ng']) {
      if (report[key] == null || report[key] === '' || children.some(child=>child[key]==null||child[key]==='')) return true;
      const parentValue = Number(report[key]);
      const childValues = children.map((child) => Number(child[key]));
      if (!Number.isFinite(parentValue) || childValues.some((value) => !Number.isFinite(value))) return true;
      if (Math.abs(childValues.reduce((sum, value) => sum + value, 0) - parentValue) > 0.000001) return true;
    }
    return false;
  });
}


function prepareMonthlyPayload(source,date){
  assertApprovedDatabasePayload(source);
  const yearMonth=normalizeYearMonth(date);
  if(source.yearMonth&&normalizeYearMonth(source.yearMonth)!==yearMonth)throw new Error('Sai kỳ dữ liệu Excel.');
  const payload={...source,yearMonth,processes:Object.fromEntries(PROCESS_CODES.map(code=>{
    const data=source.processes?.[code]||{};
    return [code,{...data,reports:(data.reports||[]).map(report=>({...report}))}];
  }))};
  const ids=new Set();
  const blocked=[];
  for(const {processCode,data} of processRows(payload)){
    for(const report of data.reports){
      const id=Number(report.id);
      if(!Number.isSafeInteger(id)||id<=0||ids.has(id))throw new Error('ID báo cáo thiếu hoặc trùng: '+report.id);
      ids.add(id);
      if(report.process_code&&String(report.process_code).trim().toUpperCase()!==processCode)throw new Error('Sai công đoạn của báo cáo '+id);
      const workDate=String(report.work_date||'').slice(0,10);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(workDate)||workDate.slice(0,7)!==yearMonth)throw new Error('Sai ngày sản xuất của báo cáo '+id);
      report.process_code=processCode;
    }
    hydrateReportDetails(data);
    if(processCode!=='GC')continue;
    data.reports=filterVerifiedGcSplitParents(data.reports);
    for(const report of data.reports){
      const machineNames=[...new Set(String(report.machine_no||'').split(/[,;\r\n]+/).map(value=>value.trim()).filter(Boolean))];
      const lines=Array.isArray(report.machineLines)?report.machineLines:Array.isArray(report.machine_lines)?report.machine_lines:[];
      const lineNames=[...new Set(lines.map(line=>String(line.machine_code||line.machine_no||line.machine_name||'').trim()).filter(Boolean))];
      // This paper template has one identity per DB report. Do not duplicate
      // that identity across machine rows or fabricate a per-machine split.
      if(machineNames.length>1||lineNames.length>1||lines.length>1||gcSplitMetadata(report).split_status==='SPLIT_PARENT')blocked.push({reportId:report.id,machines:[...new Set([...machineNames,...lineNames])]});
    }
  }
  if(blocked.length)throw Object.assign(new Error('GC còn '+blocked.length+' báo cáo cần đối soát dữ liệu từng máy: '+blocked.slice(0,20).map(item=>item.reportId).join(', ')),{code:'GC_EXPORT_SPLIT_REQUIRED',details:blocked});
  return payload;
}
module.exports={prepareMonthlyPayload,processRows};
