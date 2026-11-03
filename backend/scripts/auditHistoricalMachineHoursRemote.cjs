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
  let duplicateEventLinks = 0;
  const seenEventIds = new Set();

  const lineAudit = lines.map((line) => {
    const details = parseArray(line.deductions_json);
    const detail = details.reduce((sum, item) => sum + Math.max(0, num(item?.hours)), 0);
    const total = Math.max(
      0,
      num(line.deduction_time_hours),
      num(line.adjustment_minutes) / 60,
      detail
    );
    const eventId = Number(line.machine_event_id) || 0;
    const duplicateEvent = eventId > 0 && seenEventIds.has(eventId);
    if (eventId > 0) {
      if (duplicateEvent) duplicateEventLinks += 1;
      else seenEventIds.add(eventId);
    }
    // A shared physical event is counted once. Duplicate participant-line
    // deduction values are not summed because the event may be shared.
    if (!duplicateEvent) {
      machineDeductionHours += total;
      detailHours += detail;
      if (total > 0 && detail <= 0) totalOnlyLines += 1;
      if (detail > 0) detailLines += 1;
    }
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
  } else if (duplicateEventLinks > 0) {
    status = 'REVIEW';
    reason = 'SHARED_EVENT_DEDUCTION_DUPLICATE_RISK';
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
    duplicate_event_links: duplicateEventLinks,
    machine_lines_without_deduction: lines.filter((line) => {
      const details = parseArray(line.deductions_json);
      return Math.max(0, num(line.deduction_time_hours), num(line.adjustment_minutes) / 60,
        details.reduce((sum, item) => sum + Math.max(0, num(item?.hours)), 0)) <= 0;
    }).length,
    lines: lineAudit
  };
}

function auditMachineHours(report) {
  const lines = Array.isArray(report.machineLines) ? report.machineLines : [];
  const eventLines = Array.isArray(report.eventLines) ? report.eventLines : [];
  const eventsById = new Map(
    eventLines
      .map((event) => [Number(event?.id), event])
      .filter(([id]) => Number.isInteger(id) && id > 0)
  );

  const seenEventIds = new Set();
  const linkedEventIds = new Set();
  let physicalMachineHours = 0;
  let accountingGrossHoursExpected = 0;
  let duplicateEventLinks = 0;
  let missingLinkedEvents = 0;
  let nonApprovedLinkedEvents = 0;
  let linesWithoutEvent = 0;

  const machineLineDetails = lines.map((line) => {
    const eventId = Number(line.machine_event_id) || 0;
    const candidateEvent = eventId > 0 ? eventsById.get(eventId) : null;
    const candidateStatus = String(candidateEvent?.status || '').trim().toLowerCase();
    const linkedEvent = candidateEvent && candidateStatus === 'approved' ? candidateEvent : null;
    const lineHours = round(num(line.machine_time_hours));
    let eventState = 'NO_EVENT_LINK';
    let eventHours = null;
    let countedPhysicalHours = 0;

    if (eventId > 0) {
      linkedEventIds.add(eventId);
      if (candidateEvent && !linkedEvent) {
        eventState = 'LINKED_EVENT_NOT_APPROVED';
        nonApprovedLinkedEvents += 1;
      } else if (!linkedEvent) {
        eventState = 'LINKED_EVENT_MISSING_FROM_APPROVED_EVENT_LINES';
        missingLinkedEvents += 1;
      } else {
        eventState = 'APPROVED_EVENT_FOUND';
        eventHours = round(num(linkedEvent.machine_time_hours));
        if (seenEventIds.has(eventId)) {
          duplicateEventLinks += 1;
        } else {
          seenEventIds.add(eventId);
          countedPhysicalHours = eventHours;
          physicalMachineHours += num(linkedEvent.machine_time_hours);
          accountingGrossHoursExpected += num(linkedEvent.machine_time_hours);
        }
      }
    } else {
      linesWithoutEvent += 1;
      // This is the legacy line fallback used by buildGiaCongMachineAccounting.
      // It is accounting input, not proof of physical event time.
      accountingGrossHoursExpected += Math.max(
        0,
        num(line.excel_machine_time_hours ?? line.machine_time_hours)
      );
    }

    return {
      machine_line_id: Number(line.id) || null,
      machine_code: String(line.machine_code || ''),
      machine_line_hours: lineHours,
      machine_event_id: eventId || null,
      event_state: eventState,
      event_status: candidateEvent ? String(candidateEvent.status || '') : null,
      physical_event_hours: eventHours,
      physical_hours_counted_for_this_line: round(countedPhysicalHours)
    };
  });

  const complete = lines.length > 0
    && missingLinkedEvents === 0
    && nonApprovedLinkedEvents === 0
    && linesWithoutEvent === 0
    && machineLineDetails.every((line) =>
      line.event_state === 'APPROVED_EVENT_FOUND'
      && line.physical_event_hours !== null
      && line.physical_event_hours > 0
    );

  const hasApprovedEvent = seenEventIds.size > 0;
  const expectedSource = hasApprovedEvent
    ? ((missingLinkedEvents + nonApprovedLinkedEvents) > 0 ? 'MACHINE_EVENT_PARTIAL' : 'MACHINE_EVENT')
    : ((missingLinkedEvents + nonApprovedLinkedEvents) > 0
      ? 'MACHINE_EVENT_MISSING'
      : (lines.length ? 'MACHINE_LINE' : 'MACHINE_DATA_MISSING'));

  const actualAccounting = report.machineAccounting && typeof report.machineAccounting === 'object'
    ? report.machineAccounting
    : null;
  const actualGrossHours = actualAccounting ? round(num(actualAccounting.grossHours)) : null;
  const actualDeductionHours = actualAccounting ? round(num(actualAccounting.deductionHours)) : null;
  const actualNetHours = actualAccounting ? round(num(actualAccounting.netHours)) : null;
  const actualSource = actualAccounting ? String(actualAccounting.source || '') : null;
  const expectedDeductionHours = auditMachineDeductions(report).machine_deduction_hours;
  const expectedNetHours = round(Math.max(0, accountingGrossHoursExpected - expectedDeductionHours));
  const accountingComparison = actualAccounting
    ? {
        status: Math.abs(actualGrossHours - round(accountingGrossHoursExpected)) <= 0.0001
          && Math.abs(actualDeductionHours - expectedDeductionHours) <= 0.0001
          && Math.abs(actualNetHours - expectedNetHours) <= 0.0001
          && actualSource === expectedSource ? 'MATCH' : 'MISMATCH',
        expected_gross_hours: round(accountingGrossHoursExpected),
        actual_gross_hours: actualGrossHours,
        expected_deduction_hours: expectedDeductionHours,
        actual_deduction_hours: actualDeductionHours,
        expected_net_hours: expectedNetHours,
        actual_net_hours: actualNetHours,
        expected_source: expectedSource,
        actual_source: actualSource
      }
    : {
        status: 'NOT_PROVIDED',
        expected_gross_hours: round(accountingGrossHoursExpected),
        expected_deduction_hours: expectedDeductionHours,
        expected_net_hours: expectedNetHours
      };

  return {
    worker_hours: round(num(report.total_time)),
    machine_line_hours_total: round(lines.reduce(
      (sum, line) => sum + num(line.machine_time_hours), 0
    )),
    physical_machine_hours_confirmed: round(physicalMachineHours),
    physical_machine_hours_complete: complete,
    physical_machine_hours_source: hasApprovedEvent ? 'APPROVED_MACHINE_EVENTS' : 'NO_APPROVED_MACHINE_EVENTS',
    machine_accounting_source_expected: expectedSource,
    machine_accounting_comparison: accountingComparison,
    machine_line_count: lines.length,
    linked_event_count: linkedEventIds.size,
    unique_approved_event_count: seenEventIds.size,
    duplicate_event_links: duplicateEventLinks,
    missing_linked_event_count: missingLinkedEvents,
    non_approved_linked_event_count: nonApprovedLinkedEvents,
    machine_lines_without_event_count: linesWithoutEvent,
    lines: machineLineDetails
  };
}

function classifyReport(report) {
  const lines = Array.isArray(report.machineLines) ? report.machineLines : [];
  const totalHours = num(report.total_time);
  const deductionHours = num(report.deduction_time);
  const machineHoursAudit = auditMachineHours(report);
  const result = {
    report_id: Number(report.id),
    work_date: String(report.work_date || '').slice(0, 10),
    worker_code: String(report.worker_code || ''),
    shift: String(report.shift || ''),
    operation_mode: String(report.operation_mode || ''),
    machine_no: String(report.machine_no || ''),
    worker_total_hours: round(totalHours),
    worker_deduction_hours: round(deductionHours),
    machine_hours_audit: machineHoursAudit,
    machine_deduction_audit: auditMachineDeductions(report),
    machine_count: lines.length,
    machine_lines: machineHoursAudit.lines.map((line) => ({
      ...line,
      deduction_time_hours: round(num(
        lines.find((source) => Number(source.id) === line.machine_line_id)?.deduction_time_hours
      )),
      deductions_json_present: Boolean(
        lines.find((source) => Number(source.id) === line.machine_line_id)?.deductions_json
      )
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
  if (lines.some((line) => num(line.machine_time_hours) > MAX_MACHINE_HOURS)
      || machineHoursAudit.lines.some((line) => num(line.physical_event_hours) > MAX_MACHINE_HOURS)) {
    result.action = 'REVIEW';
    result.reason = 'MACHINE_LINE_OR_PHYSICAL_EVENT_HOURS_OVER_12_HOURS';
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
  if (lines.length > 1 && machineHoursAudit.machine_lines_without_event_count > 0) {
    result.action = 'REVIEW';
    result.reason = 'MULTI_MACHINE_ALLOCATION_REQUIRES_CONFIRMATION';
    return result;
  }
  if (machineHoursAudit.machine_accounting_comparison.status === 'MISMATCH') {
    result.action = 'REVIEW';
    result.reason = 'MACHINE_ACCOUNTING_DOES_NOT_MATCH_EVENT_AND_LINE_SOURCES';
    return result;
  }
  if (machineHoursAudit.non_approved_linked_event_count > 0) {
    result.action = 'REVIEW';
    result.reason = 'LINKED_MACHINE_EVENT_NOT_APPROVED';
    return result;
  }
  if (machineHoursAudit.missing_linked_event_count > 0) {
    result.action = 'REVIEW';
    result.reason = 'LINKED_MACHINE_EVENT_MISSING_OR_NOT_APPROVED';
    return result;
  }
  if (machineHoursAudit.machine_lines_without_event_count > 0) {
    result.action = 'REVIEW';
    result.reason = 'MACHINE_LINE_WITHOUT_PHYSICAL_EVENT';
    return result;
  }
  if (String(report.operation_mode || '').trim().toUpperCase() === 'MACHINE'
      && machineHoursAudit.machine_accounting_comparison.status === 'NOT_PROVIDED') {
    result.action = 'REVIEW';
    result.reason = 'MACHINE_ACCOUNTING_PAYLOAD_MISSING';
    return result;
  }
  if (!machineHoursAudit.physical_machine_hours_complete) {
    result.action = 'REVIEW';
    result.reason = 'PHYSICAL_MACHINE_HOURS_NOT_CONFIRMED_BY_APPROVED_EVENTS';
    return result;
  }

  result.reason = 'APPROVED_MACHINE_EVENTS_CONFIRMED_PHYSICAL_TIME';
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

  const machineHoursCounts = findings.reduce((acc, item) => {
    const audit = item.machine_hours_audit;
    if (!audit) return acc;
    const isMachineRelevant = String(item.operation_mode || '').trim().toUpperCase() === 'MACHINE'
      || item.machine_count > 0
      || String(item.machine_no || '').trim() !== '';
    if (!isMachineRelevant) return acc;
    acc[audit.physical_machine_hours_source] = (acc[audit.physical_machine_hours_source] || 0) + 1;
    if (audit.physical_machine_hours_complete) acc.complete += 1;
    else acc.incomplete += 1;
    acc.missing_linked_events += audit.missing_linked_event_count || 0;
    acc.lines_without_event += audit.machine_lines_without_event_count || 0;
    acc.duplicate_event_links += audit.duplicate_event_links || 0;
    return acc;
  }, {
    complete: 0,
    incomplete: 0,
    missing_linked_events: 0,
    lines_without_event: 0,
    duplicate_event_links: 0
  });

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
    machine_hours_counts: machineHoursCounts,
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

module.exports = { classifyReport, monthList, auditMachineDeductions, auditMachineHours };
