const { calculateGcShiftHours, AUTO_MACHINE_NUMBERS, machineNumber, grossHours } = require('../utils/gcShiftHours');

function query(executor, sql, params = []) {
  if (executor.promise) return executor.promise().query(sql, params);
  if (executor.query.length >= 3) {
    return new Promise((resolve, reject) => executor.query(sql, params, (error, rows) => error ? reject(error) : resolve([rows, []])));
  }
  return executor.query(sql, params);
}

function grossParentHours(row) {
  const total = Number(row?.total_time);
  if (Number.isFinite(total) && total > 0) return total;
  return Math.max(0, Number(row?.actual_time) || 0) + Math.max(0, Number(row?.deduction_time) || 0);
}

async function assertWorkerShiftHours({
  executor, workerId, processId, workDate, shift, candidate,
  excludeApprovedReportId = null, excludeTempReportId = null
}) {
  const worker = Number(workerId);
  const date = String(workDate || '').slice(0, 10);
  const shiftValue = String(shift || '').trim();
  if (!Number.isInteger(worker) || worker <= 0 || !/^\\d{4}-\\d{2}-\\d{2}$/.test(date) || !shiftValue) {
    const error = new Error('Thiếu công nhân, ngày hoặc ca để kiểm tra giới hạn 12 giờ');
    error.status = 422; error.code = 'SHIFT_HOURS_CONTEXT_REQUIRED'; error.isPublic = true;
    throw error;
  }

  const approvedExclude = excludeApprovedReportId ? ' AND pr.id <> ?' : '';
  const tempExclude = excludeTempReportId ? ' AND pr.id <> ?' : '';
  const params = [worker, date, shiftValue];
  if (excludeApprovedReportId) params.push(Number(excludeApprovedReportId));
  params.push(worker, date, shiftValue);
  if (excludeTempReportId) params.push(Number(excludeTempReportId));

  const sql = [
    "SELECT pr.id, pr.process_id, p.process_code, pr.actual_time, pr.deduction_time, pr.total_time, 'approved' AS source",
    'FROM production_reports pr JOIN processes p ON p.id=pr.process_id',
    "WHERE pr.worker_id=? AND pr.work_date=? AND pr.shift=? AND pr.status='approved'" + approvedExclude,
    'UNION ALL',
    "SELECT pr.id, pr.process_id, p.process_code, pr.actual_time, pr.deduction_time, pr.total_time, 'temp' AS source",
    'FROM production_reports_temp pr JOIN processes p ON p.id=pr.process_id',
    "WHERE pr.worker_id=? AND pr.work_date=? AND pr.shift=? AND pr.status IN ('pending','need_fix')" + tempExclude
  ].join(' ');

  const [reports] = await query(executor, sql, params);
  const approvedGc = reports.filter((r) => r.source === 'approved' && String(r.process_code).toUpperCase() === 'GC');
  const tempGc = reports.filter((r) => r.source === 'temp' && String(r.process_code).toUpperCase() === 'GC');
  const approvedIds = approvedGc.map((r) => Number(r.id));
  const tempIds = tempGc.map((r) => Number(r.id));
  const lineGroups = new Map();
  const allGcLines = [];
  if (approvedIds.length) {
    const [lines] = await query(executor, 'SELECT report_id AS parent_id, machine_code, machine_time_hours, actual_time_hours, deduction_time_hours FROM production_report_machine_lines WHERE report_id IN (' + approvedIds.map(() => '?').join(',') + ')', approvedIds);
    for (const line of lines) {
      const key = 'approved:' + Number(line.parent_id);
      if (!lineGroups.has(key)) lineGroups.set(key, []);
      lineGroups.get(key).push(line);
      allGcLines.push(line);
    }
  }
  if (tempIds.length) {
    const [lines] = await query(executor, 'SELECT temp_report_id AS parent_id, machine_code, machine_time_hours, actual_time_hours, deduction_time_hours FROM production_temp_machine_lines WHERE temp_report_id IN (' + tempIds.map(() => '?').join(',') + ')', tempIds);
    for (const line of lines) {
      const key = 'temp:' + Number(line.parent_id);
      if (!lineGroups.has(key)) lineGroups.set(key, []);
      lineGroups.get(key).push(line);
      allGcLines.push(line);
    }
  }

  let existingHours = 0;
  for (const report of reports) {
    const isGc = String(report.process_code).toUpperCase() === 'GC';
    const lines = lineGroups.get(String(report.source) + ':' + Number(report.id)) || [];
    if (!isGc) existingHours += grossParentHours(report);
    else if (!lines.length) existingHours += grossParentHours(report);
  }

  // Aggregate automatic-machine time across the whole shift, not report-by-report:
  // the same worker may submit separate reports for automatic machines that ran in parallel.
  const hoursByMachine = new Map();
  for (const line of allGcLines) {
    const number = machineNumber(line.machine_code);
    const key = number === null ? String(line.machine_code || '').trim().toUpperCase() : String(number);
    hoursByMachine.set(key, (hoursByMachine.get(key) || 0) + grossHours(line));
  }
  let sequentialMachineHours = 0;
  let automaticMachineHours = 0;
  for (const [key, hours] of hoursByMachine) {
    const number = Number(key);
    if (AUTO_MACHINE_NUMBERS.has(number)) automaticMachineHours = Math.max(automaticMachineHours, hours);
    else sequentialMachineHours += hours;
  }
  existingHours += sequentialMachineHours + automaticMachineHours;

  const candidateProcessCode = String(candidate?.processCode || '').trim().toUpperCase();
  const candidateLines = Array.isArray(candidate?.machineLines) ? candidate.machineLines : [];
  const candidateHours = candidateProcessCode === 'GC' && candidateLines.length
    ? calculateGcShiftHours(candidateLines)
    : grossParentHours(candidate || {});
  const projected = existingHours + candidateHours;
  if (projected > 12 + 1e-9) {
    const error = new Error('Tổng thời gian trong ca là ' + projected.toFixed(2) + ' giờ; giới hạn một công nhân là 12 giờ, đã tính cả giờ nghỉ.');
    error.status = 422; error.code = 'DAILY_WORKING_HOURS_LIMIT_EXCEEDED'; error.isPublic = true;
    error.details = { worker_id: worker, work_date: date, shift: shiftValue, existing_hours: Number(existingHours.toFixed(4)), incoming_hours: Number(candidateHours.toFixed(4)), projected_hours: Number(projected.toFixed(4)), limit_hours: 12 };
    throw error;
  }
  return { existingHours, incomingHours: candidateHours, projectedHours: projected, limitHours: 12 };
}

module.exports = { assertWorkerShiftHours };
