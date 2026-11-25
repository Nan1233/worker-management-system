'use strict';

// GC machine rows contain saved Worker credit, not shared physical-event
// production. No synthetic report ID, equal division or DB mutation.
const { parseDetailArray } = require('./monthlyWorkbookDetails.cjs');
const text = value => String(value ?? '').trim();
const positiveId = value => {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};
const nonnegative = (value, integer = false) => {
  if (value == null || text(value) === '') return false;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && (!integer || Number.isSafeInteger(n));
};
const mode = report => text(report.operation_mode).toUpperCase();
const linesOf = report => Array.isArray(report.machineLines) ? report.machineLines
  : Array.isArray(report.machine_lines) ? report.machine_lines : [];
const machineCode = line => text(line.machine_code || line.machine_no || line.machine_name).toUpperCase();
const namesOf = report => [...new Set(text(report.machine_no).split(/[,;\r\n]+/).map(x=>x.trim().toUpperCase()).filter(Boolean))];
const rowIdentityKey = report => report.excelMachineLineId == null
  ? Number(report.id) : 'machine:' + Number(report.id) + ':' + Number(report.excelMachineLineId);

function validateGcMachineReports(reports) {
  const issues = [];
  const seenLineIds = new Set();
  for (const report of reports) {
    const lines = linesOf(report);
    const reportMachines = namesOf(report);
    const lineMachines = [...new Set(lines.map(machineCode).filter(Boolean))];
    const fail = reason => issues.push({reportId:report.id,machines:[...new Set([...reportMachines,...lineMachines])],reason});
    if (mode(report) !== 'MACHINE') {
      if (lines.length || reportMachines.length > 1) fail('NON_MACHINE_REPORT_HAS_MACHINE_LINES');
      continue;
    }
    if (!lines.length) { fail('MISSING_APPROVED_MACHINE_LINES'); continue; }
    if (reportMachines.some(code=>!lineMachines.includes(code))
      || (reportMachines.length > 1 && lineMachines.some(code=>!reportMachines.includes(code)))) {
      fail('MACHINE_CODE_MISMATCH');
    }
    for (const line of lines) {
      const id = positiveId(line.id);
      if (!id || seenLineIds.has(id) || !machineCode(line)
        || (line.report_id != null && Number(line.report_id) !== Number(report.id))) {
        fail('INVALID_OR_DUPLICATE_MACHINE_LINE_ID'); continue;
      }
      seenLineIds.add(id);
      if (!text(line.product_code) || !nonnegative(line.ok_quantity,true)
        || !nonnegative(line.ng_quantity,true) || !nonnegative(line.machine_time_hours)
        || !nonnegative(line.standard_output)) fail('INCOMPLETE_MACHINE_LINE_SNAPSHOT');
      const rawEvent = line.machine_event_id;
      if (rawEvent != null && text(rawEvent) !== '' && Number(rawEvent) !== 0 && !positiveId(rawEvent)) {
        fail('INVALID_MACHINE_EVENT_ID');
      }
    }
  }
  if (issues.length) throw Object.assign(new Error('GC cần đối soát dữ liệu từng máy: '+issues.slice(0,20).map(x=>x.reportId+':'+x.reason).join(', ')), {
    code:'GC_EXPORT_SPLIT_REQUIRED',details:issues
  });
}

function projectGcMachineRows(reports) {
  validateGcMachineReports(reports);
  return reports.flatMap(report => {
    if (mode(report) !== 'MACHINE') return [report];
    const lines = linesOf(report).slice().sort((a,b)=>Number(a.sort_order||0)-Number(b.sort_order||0)||Number(a.id)-Number(b.id));
    return lines.map(line => {
      const defects = parseDetailArray(line.defects).length
        ? parseDetailArray(line.defects) : parseDetailArray(line.defects_json);
      const deductions = parseDetailArray(line.deductions).length
        ? parseDetailArray(line.deductions) : parseDetailArray(line.deductions_json);
      // A single line may use an existing report-level breakdown, as the
      // approved metrics contract permits. Never borrow it for multiple lines.
      return {
        ...report,
        excelMachineLineId:Number(line.id),
        machine_no:text(line.machine_code || line.machine_no || line.machine_name),
        product_name:text(line.product_code),product_code:text(line.product_code),
        machineLines:[line],machine_lines:[line],
        tt_ok:Number(line.ok_quantity),tt_ng:Number(line.ng_quantity),
        deductions:deductions.length ? deductions : (lines.length===1 ? report.deductions||[] : []),
        defects:defects.length ? defects : (lines.length===1 ? report.defects||[] : []),
        deduction_time:lines.length===1 ? report.deduction_time : null,
        machineAccounting:null,machinePerformance:null,machine_performance:null,
        // Rendered rows use the same line-based KPI engine as the parent;
        // these projections must never feed the monthly report count/summary.
        excelReadOnly:true
      };
    });
  });
}

module.exports={validateGcMachineReports,projectGcMachineRows,rowIdentityKey,linesOf};
