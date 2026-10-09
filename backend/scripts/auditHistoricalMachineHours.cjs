'use strict';

/**
 * Read-only audit for legacy approved GC reports before 2026-10-08.
 *
 * This script NEVER updates or deletes database rows. It classifies reports
 * whose worker-level time may need to be copied to machine lines, and flags
 * ambiguous or over-12-hour cases for manual reconciliation.
 *
 * Run from backend:
 *   node scripts/auditHistoricalMachineHours.cjs
 *   node scripts/auditHistoricalMachineHours.cjs > historical-machine-hours-audit.json
 */
require('dotenv').config();
const db = require('../config/db');

const CUTOFF = '2026-10-08';
const MAX_MACHINE_HOURS = 12;

const num = (value) => {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
};
const round = (value) => Math.round((value + Number.EPSILON) * 10000) / 10000;

function classifyReport(report, lines) {
  const totalHours = num(report.total_time);
  const deductionHours = num(report.deduction_time);
  const machineLines = Array.isArray(lines) ? lines : [];
  const missingHours = machineLines.filter((line) => num(line.machine_time_hours) <= 0);
  const hasOverLimitMachine = machineLines.some((line) => num(line.machine_time_hours) > MAX_MACHINE_HOURS);
  const result = {
    report_id: Number(report.id),
    work_date: String(report.work_date || '').slice(0, 10),
    worker_code: String(report.worker_code || ''),
    shift: String(report.shift || ''),
    operation_mode: String(report.operation_mode || ''),
    machine_no: String(report.machine_no || ''),
    worker_total_hours: round(totalHours),
    worker_deduction_hours: round(deductionHours),
    machine_count: machineLines.length,
    machine_lines: machineLines.map((line) => ({
      id: Number(line.id),
      machine_code: String(line.machine_code || ''),
      machine_time_hours: round(num(line.machine_time_hours)),
      deduction_time_hours: round(num(line.deduction_time_hours)),
      deductions_json_present: Boolean(line.deductions_json)
    })),
    action: 'NO_CHANGE',
    reason: ''
  };

  if (!machineLines.length) {
    const indicatesMachine = String(report.operation_mode || '').trim().toUpperCase() === 'MACHINE'
      || String(report.machine_no || '').trim() !== '';
    if (indicatesMachine) {
      result.action = 'REVIEW';
      result.reason = 'MACHINE_REPORT_WITHOUT_MACHINE_LINES';
    } else {
      result.reason = 'NO_MACHINE_USE_WORKER_TIME';
    }
    return result;
  }
  if (hasOverLimitMachine || machineLines.some((line) => num(line.machine_time_hours) > MAX_MACHINE_HOURS)) {
    result.action = 'REVIEW';
    result.reason = 'EXISTING_MACHINE_TIME_OVER_12_HOURS';
    return result;
  }
  if (totalHours > MAX_MACHINE_HOURS || deductionHours > MAX_MACHINE_HOURS) {
    result.action = 'REVIEW';
    result.reason = 'WORKER_TIME_OR_DEDUCTION_OVER_12_HOURS';
    return result;
  }
  if (totalHours <= 0) {
    result.action = 'REVIEW';
    result.reason = 'MISSING_OR_ZERO_WORKER_TIME';
    return result;
  }
  if (deductionHours < 0 || deductionHours > totalHours) {
    result.action = 'REVIEW';
    result.reason = 'INVALID_WORKER_DEDUCTION';
    return result;
  }
  if (!missingHours.length) {
    result.reason = 'MACHINE_LINES_ALREADY_HAVE_TIME';
    return result;
  }
  if (machineLines.length > 1) {
    result.action = 'REVIEW';
    result.reason = 'MULTI_MACHINE_ALLOCATION_REQUIRES_CONFIRMATION';
    return result;
  }

  result.action = 'ELIGIBLE_SINGLE_MACHINE';
  result.reason = 'ONE_MACHINE_LINE_MISSING_TIME_WITH_VALID_WORKER_TIME';
  return result;
}

async function main() {
  const [reports] = await db.promise().query(
    `SELECT pr.id, pr.work_date, pr.shift, pr.operation_mode,
            pr.total_time, pr.actual_time, pr.deduction_time,
            pr.machine_no,
            w.worker_code
       FROM production_reports pr
       INNER JOIN workers w ON w.id = pr.worker_id
       INNER JOIN processes p ON p.id = pr.process_id
      WHERE UPPER(TRIM(p.process_code)) = 'GC'
        AND LOWER(TRIM(COALESCE(pr.status, ''))) = 'approved'
        AND pr.work_date < ?
      ORDER BY pr.work_date, pr.id`,
    [CUTOFF]
  );

  const reportIds = reports.map((report) => Number(report.id));
  let lines = [];
  if (reportIds.length) {
    const placeholders = reportIds.map(() => '?').join(',');
    [lines] = await db.promise().query(
      `SELECT id, report_id, machine_code, machine_time_hours,
              deduction_time_hours, deductions_json, sort_order
         FROM production_report_machine_lines
        WHERE report_id IN (${placeholders})
        ORDER BY report_id, sort_order, id`,
      reportIds
    );
  }

  const linesByReport = new Map();
  for (const line of lines) {
    const id = Number(line.report_id);
    if (!linesByReport.has(id)) linesByReport.set(id, []);
    linesByReport.get(id).push(line);
  }

  const findings = reports.map((report) => classifyReport(
    report,
    linesByReport.get(Number(report.id)) || []
  ));
  const counts = findings.reduce((acc, item) => {
    acc[item.action] = (acc[item.action] || 0) + 1;
    acc.reasons[item.reason] = (acc.reasons[item.reason] || 0) + 1;
    return acc;
  }, { reasons: {} });

  process.stdout.write(JSON.stringify({
    success: true,
    read_only: true,
    cutoff_exclusive: CUTOFF,
    max_machine_hours: MAX_MACHINE_HOURS,
    report_count: findings.length,
    counts,
    findings
  }, null, 2) + '\n');
}

if (require.main === module) {
  main()
    .catch((error) => {
      process.stderr.write(JSON.stringify({
        success: false,
        read_only: true,
        message: error?.message || String(error)
      }, null, 2) + '\n');
      process.exitCode = 1;
    })
    .finally(async () => {
      try { await db.end(); } catch {}
    });
}

module.exports = { classifyReport };
