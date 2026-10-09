'use strict';

/**
 * Read-only historical GC machine-hours audit through the KTC TEST API.
 * This intentionally does not connect directly to a local database and never
 * writes to the database. Requires an admin/manager token permitted to read
 * company export data from the configured test API.
 *
 * Environment:
 *   KTC_AUDIT_API_URL (optional; defaults to KTC BE test company-data endpoint)
 *   KTC_AUDIT_TOKEN or TOKEN (Bearer token; never printed)
 *   KTC_AUDIT_FROM_MONTH (optional YYYY-MM; defaults to 2020-01)
 *
 * Run from backend:
 *   npm run audit:historical-machine-hours:remote > historical-machine-hours-audit.json 2>&1
 */
require('dotenv').config();

const API_URL = String(
  process.env.KTC_AUDIT_API_URL ||
  'https://ktc-be-test.nan978971.workers.dev/api/reports/export-excel/company-data'
).trim();
const TOKEN = String(process.env.KTC_AUDIT_TOKEN || process.env.TOKEN || '').trim();
const CUTOFF = '2026-10-08';
const MAX_MACHINE_HOURS = 12;
const FROM_MONTH = String(process.env.KTC_AUDIT_FROM_MONTH || '2020-01').trim();

const num = (value) => {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
};
const round = (value) => Math.round((value + Number.EPSILON) * 10000) / 10000;

function parseArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function auditMachineDeductions(report) {
  const lines = Array.isArray(report.machineLines) ? report.machineLines : [];
  const workerDeductionHours = Math.max(0, num(report.deduction_time));
  let machineDeductionHours = 0;
  let detailHours = 0;
  let totalOnlyLines = 0;
  let detailLines = 0;

  const lineAudit = lines.map((line) => {
    const details = parseArray(line.deductions_json);
    const detail = details.reduce((sum, item) => sum + Math.max(0, num(item?.hours)), 0);
    const total = Math.max(
      0,
      num(line.deduction_time_hours),
      num(line.adjustment_minutes) / 60,
      detail
    );
    machineDeductionHours += total;
    detailHours += detail;
    if (total > 0 && detail <= 0) totalOnlyLines += 1;
    if (detail > 0) detailLines += 1;
    return {
      machine_line_id: Number(line.id) || null,
      machine_code: String(line.machine_code || ''),
      machine_time_hours: round(num(line.machine_time_hours)),
      deduction_time_hours: round(Math.max(0, num(line.deduction_time_hours), num(line.adjustment_minutes) / 60)),
      deduction_detail_hours: round(detail),
      deduction_status: detail > 0
        ? 'DETAIL_RECORDED'
        : total > 0 ? 'TOTAL_ONLY_NO_BREAKDOWN' : 'NO_MACHINE_DEDUCTION_RECORDED'
    };
  });

  let status;
  let reason;
  if (!lines.length) {
    status = 'REVIEW';
    reason = 'MACHINE_DEDUCTION_CANNOT_BE_AUDITED_WITHOUT_MACHINE_LINES';
  } else if (machineDeductionHours > 0 && detailHours > 0 && totalOnlyLines === 0) {
    status = 'RECORDED_WITH_DETAILS';
    reason = 'MACHINE_DEDUCTION_DETAILS_PRESENT';
  } else if (machineDeductionHours > 0) {
    status = 'PARTIAL_OR_TOTAL_ONLY';
    reason = 'MACHINE_DEDUCTION_BREAKDOWN_INCOMPLETE';
  } else if (workerDeductionHours > 0) {
    status = 'REVIEW';
    reason = 'WORKER_HAS_DEDUCTION_BUT_MACHINE_HAS_NONE';
  } else {
    status = 'REVIEW';
    reason = 'NO_MACHINE_DEDUCTION_RECORDED_CANNOT_ASSUME_ZERO';
  }

  return {
    status,
    reason,
    worker_deduction_hours: round(workerDeductionHours),
    machine_deduction_hours: round(machineDeductionHours),
    machine_deduction_detail_hours: round(detailHours),
    machine_lines_with_deduction_detail: detailLines,
    machine_lines_total_only: totalOnlyLines,
    machine_lines_without_deduction: lines.filter((line) => {
      const details = parseArray(line.deductions_json);
      return Math.max(0, num(line.deduction_time_hours), num(line.adjustment_minutes) / 60,
        details.reduce((sum, item) => sum + Math.max(0, num(item?.hours)), 0)) <= 0;
    }).length,
    lines: lineAudit
  };
}

function classifyReport(report) {
  const lines = Array.isArray(report.machineLines) ? report.machineLines : [];
  const totalHours = num(report.total_time);
  const deductionHours = num(report.deduction_time);
  const missingHours = lines.filter((line) => num(line.machine_time_hours) <= 0);
  const result = {
    report_id: Number(report.id),
    work_date: String(report.work_date || '').slice(0, 10),
    worker_code: String(report.worker_code || ''),
    shift: String(report.shift || ''),
    operation_mode: String(report.operation_mode || ''),
    machine_no: String(report.machine_no || ''),
    worker_total_hours: round(totalHours),
    worker_deduction_hours: round(deductionHours),
    machine_deduction_audit: auditMachineDeductions(report),
    machine_count: lines.length,
    machine_lines: lines.map((line) => ({
      id: Number(line.id),
      machine_code: String(line.machine_code || ''),
      machine_time_hours: round(num(line.machine_time_hours)),
      deduction_time_hours: round(num(line.deduction_time_hours)),
      deductions_json_present: Boolean(line.deductions_json)
    })),
    action: 'NO_CHANGE',
    reason: ''
  };

  if (!lines.length) {
    const indicatesMachine = String(report.operation_mode || '').trim().toUpperCase() === 'MACHINE'
      || String(report.machine_no || '').trim() !== '';
    result.action = indicatesMachine ? 'REVIEW' : 'NO_CHANGE';
    result.reason = indicatesMachine ? 'MACHINE_REPORT_WITHOUT_MACHINE_LINES' : 'NO_MACHINE_USE_WORKER_TIME';
    return result;
  }
  if (lines.some((line) => num(line.machine_time_hours) > MAX_MACHINE_HOURS)) {
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
  if (lines.length > 1) {
    result.action = 'REVIEW';
    result.reason = 'MULTI_MACHINE_ALLOCATION_REQUIRES_CONFIRMATION';
    return result;
  }
  result.action = 'ELIGIBLE_SINGLE_MACHINE';
  result.reason = 'ONE_MACHINE_LINE_MISSING_TIME_WITH_VALID_WORKER_TIME';
  return result;
}

function monthList(fromMonth, cutoff) {
  if (!/^\d{4}-\d{2}$/.test(fromMonth)) throw new Error('KTC_AUDIT_FROM_MONTH must use YYYY-MM');
  const [startYear, startMonth] = fromMonth.split('-').map(Number);
  if (startMonth < 1 || startMonth > 12) throw new Error('KTC_AUDIT_FROM_MONTH month must be 01-12');
  const [endYear, endMonth] = cutoff.slice(0, 7).split('-').map(Number);
  const months = [];
  let year = startYear;
  let month = startMonth;
  while (year < endYear || (year === endYear && month <= endMonth)) {
    months.push(`${year}-${String(month).padStart(2, '0')}`);
    month += 1;
    if (month > 12) { month = 1; year += 1; }
    if (months.length > 240) throw new Error('Audit range exceeds 240 months; narrow KTC_AUDIT_FROM_MONTH');
  }
  return months;
}

async function fetchMonth(yearMonth) {
  const url = new URL(API_URL);
  url.searchParams.set('date', `${yearMonth}-01`);
  let lastError;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' }
      });
      const text = await response.text();
      let payload;
      try { payload = JSON.parse(text); } catch { payload = null; }
      if (response.ok && payload?.success === true && payload?.data) return payload.data;
      const error = new Error(`TEST_API_REQUEST_FAILED month=${yearMonth} status=${response.status} code=${payload?.code || 'INVALID_RESPONSE'} message=${payload?.message || 'API response was not successful'}`);
      error.status = response.status;
      if (response.status !== 429 && response.status < 500) throw error;
      lastError = error;
    } catch (error) {
      if (error?.status && error.status !== 429 && error.status < 500) throw error;
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }
  throw lastError || new Error(`TEST_API_REQUEST_FAILED month=${yearMonth}`);
}

async function main() {
  if (!TOKEN) throw new Error('Missing auth token: set KTC_AUDIT_TOKEN or TOKEN in the terminal; token is never printed');
  const months = monthList(FROM_MONTH, CUTOFF);
  const findings = [];
  const failures = [];
  for (const yearMonth of months) {
    try {
      const data = await fetchMonth(yearMonth);
      const reports = data?.processes?.GC?.reports;
      if (!Array.isArray(reports)) throw new Error(`TEST_API_GC_REPORTS_MISSING month=${yearMonth}`);
      for (const report of reports) {
        const workDate = String(report.work_date || '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate) || workDate >= CUTOFF) continue;
        findings.push(classifyReport(report));
      }
    } catch (error) {
      failures.push({ month: yearMonth, message: error?.message || String(error) });
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  const deductionCounts = findings.reduce((acc, item) => {
    const audit = item.machine_deduction_audit;
    if (!audit) return acc;
    acc[audit.status] = (acc[audit.status] || 0) + 1;
    acc.reasons[audit.reason] = (acc.reasons[audit.reason] || 0) + 1;
    return acc;
  }, { reasons: {} });

  const counts = findings.reduce((acc, item) => {
    acc[item.action] = (acc[item.action] || 0) + 1;
    acc.reasons[item.reason] = (acc.reasons[item.reason] || 0) + 1;
    return acc;
  }, { reasons: {} });

  process.stdout.write(JSON.stringify({
    success: failures.length === 0,
    read_only: true,
    data_source: 'KTC_BE_TEST_API -> TiDB configured by test Worker',
    api_url: API_URL,
    cutoff_exclusive: CUTOFF,
    from_month: FROM_MONTH,
    months_requested: months.length,
    months_failed: failures.length,
    failures,
    max_machine_hours: MAX_MACHINE_HOURS,
    report_count: findings.length,
    counts,
    machine_deduction_counts: deductionCounts,
    findings
  }, null, 2) + '\n');
  if (failures.length) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(JSON.stringify({
      success: false,
      read_only: true,
      message: error?.message || String(error)
    }, null, 2) + '\n');
    process.exitCode = 1;
  });
}

module.exports = { classifyReport, monthList, auditMachineDeductions };
