'use strict';

// Verifies a locally saved, authenticated company-data JSON response.
// Performs NO HTTP requests and NO database writes. Outputs aggregate counts only.
const fs = require('node:fs');
const { expectedAccounting } = require('../../scripts/gcMachineTimeRemoteSmoke.cjs');

const near = (a, b) => Number.isFinite(Number(a))
  && Number.isFinite(Number(b))
  && Math.abs(Number(a) - Number(b)) <= 0.000001;

function auditGcExportPayload(payload, { requireSharedEvent = false } = {}) {
  const data = payload?.data || payload;
  const gc = data?.processes?.GC;
  if (data?.dataSource !== 'tidb.production_reports.approved'
      || !gc || !Array.isArray(gc.reports)) {
    throw new Error('INVALID_APPROVED_COMPANY_DATA_ENVELOPE');
  }
  const errors = [];
  const warnings = [];
  const reportIds = new Set();
  const events = new Map();
  const eventReports = new Map();
  const stats = {
    totalGcReports: gc.reports.length,
    machineReports: 0,
    verifiedMachineReports: 0,
    uniqueLinkedPhysicalEvents: 0,
    sharedPhysicalEventsAcrossReports: 0,
    sharedWorkerLinks: 0,
    uniquePhysicalEventHours: 0,
    noLinkedEventReports: 0,
  };
  const addError = (code) => errors.push(code);

  for (const report of gc.reports) {
    const reportId = Number(report?.id);
    if (!Number.isSafeInteger(reportId) || reportId <= 0 || reportIds.has(reportId)) {
      addError('DUPLICATE_OR_INVALID_APPROVED_REPORT_ID');
      continue;
    }
    reportIds.add(reportId);
    if (String(report.dataSource || '').trim() !== 'production_reports'
        || report.isApprovedDatabaseRecord !== true
        || String(report.status || '').trim().toLowerCase() !== 'approved') {
      addError('UNVERIFIED_APPROVED_REPORT_PROVENANCE');
    }
    if (String(report.operation_mode || '').trim().toUpperCase() !== 'MACHINE') continue;

    stats.machineReports += 1;
    const lines = Array.isArray(report.machineLines) ? report.machineLines : [];
    if (!lines.length) {
      addError('GC_MACHINE_REPORT_WITHOUT_LINES');
      continue;
    }
    if (!report.machineAccounting) {
      addError('GC_MACHINE_ACCOUNTING_MISSING');
      continue;
    }

    const expected = expectedAccounting(report);
    if (!near(report.machineAccounting.grossHours, expected.grossHours)
        || !near(report.machineAccounting.deductionHours, expected.deductionHours)
        || !near(report.machineAccounting.netHours, expected.netHours)
        || String(report.machineAccounting.source) !== expected.source) {
      addError('GC_ACCOUNTING_MISMATCH');
    } else {
      stats.verifiedMachineReports += 1;
    }
    if (expected.source === 'MACHINE_EVENT_MISSING' || expected.source === 'MACHINE_EVENT_PARTIAL') {
      addError('GC_MISSING_LINKED_PHYSICAL_EVENT');
    }

    // Reject duplicate physical-event IDs before creating the lookup map:
    // a plain Map constructor would silently replace an earlier event row.
    const reportEvents = new Map();
    for (const event of (Array.isArray(report.eventLines) ? report.eventLines : [])) {
      const eventId = Number(event?.id);
      if (!Number.isSafeInteger(eventId) || eventId <= 0) {
        addError('GC_INVALID_PHYSICAL_EVENT_ID');
        continue;
      }
      if (reportEvents.has(eventId)) {
        addError('GC_DUPLICATE_PHYSICAL_EVENT_ID_IN_REPORT');
        continue;
      }
      reportEvents.set(eventId, event);
    }

    const idsInReport = new Set();
    for (const line of lines) {
      const rawEventId = line?.machine_event_id;
      // Null/empty/zero means an intentionally unlinked legacy machine line.
      // A malformed nonempty reference is different: it must not silently
      // become an unlinked line and escape the physical-event audit.
      if (rawEventId === null || rawEventId === undefined || rawEventId === '' || rawEventId === 0 || rawEventId === '0') continue;
      const eventId = Number(rawEventId);
      if (!Number.isSafeInteger(eventId) || eventId <= 0) {
        addError('GC_INVALID_MACHINE_EVENT_REFERENCE');
        continue;
      }
      if (idsInReport.has(eventId)) continue;
      idsInReport.add(eventId);

      const event = reportEvents.get(eventId);
      if (!event) {
        addError('GC_LINKED_EVENT_NOT_IN_EXPORT');
        continue;
      }
      const hours = Number(event.machine_time_hours);
      if (!Number.isFinite(hours) || hours < 0) {
        addError('GC_INVALID_PHYSICAL_EVENT_HOURS');
        continue;
      }
      const identity = [
        String(event.machine_code || '').trim().toUpperCase(),
        String(event.work_date || '').slice(0, 10),
        String(event.shift || '').trim().toUpperCase(),
      ].join('|');
      const previous = events.get(eventId);
      if (previous && (!near(previous.hours, hours) || previous.identity !== identity)) {
        addError('GC_SHARED_EVENT_INCONSISTENT_ACROSS_WORKERS');
      } else if (!previous) {
        events.set(eventId, { hours, identity });
      }
      if (!eventReports.has(eventId)) eventReports.set(eventId, new Set());
      eventReports.get(eventId).add(reportId);
    }
    if (!idsInReport.size) stats.noLinkedEventReports += 1;
  }

  stats.uniqueLinkedPhysicalEvents = events.size;
  stats.sharedPhysicalEventsAcrossReports =
    [...eventReports.values()].filter((ids) => ids.size > 1).length;
  stats.sharedWorkerLinks =
    [...eventReports.values()].reduce((sum, ids) => sum + Math.max(0, ids.size - 1), 0);
  stats.uniquePhysicalEventHours = Number(
    [...events.values()].reduce((sum, event) => sum + event.hours, 0).toFixed(6)
  );

  if (!stats.machineReports) warnings.push('NO_GC_MACHINE_REPORTS_IN_EXPORT');
  if (!stats.sharedPhysicalEventsAcrossReports) warnings.push('NO_SHARED_MACHINE_EVENT_SAMPLE');
  if (requireSharedEvent && !stats.sharedPhysicalEventsAcrossReports) {
    addError('REQUIRED_SHARED_MACHINE_SAMPLE_MISSING');
  }

  return {
    readOnly: true,
    passed: errors.length === 0,
    stats,
    errors: [...new Set(errors)].sort(),
    warnings: [...new Set(warnings)].sort(),
  };
}

if (require.main === module) {
  try {
    const file = process.argv[2];
    if (!file) throw new Error('USAGE: node backend/scripts/auditGcExcelPayload.cjs <local-company-data.json>');
    // Keep this local: the payload can contain names, internal codes and production details.
    const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
    const result = auditGcExportPayload(payload, {
      requireSharedEvent: process.env.KTC_REQUIRE_SHARED_MACHINE_SAMPLE === '1'
    });
    console.log(JSON.stringify(result, null, 2));
    if (!result.passed) process.exitCode = 1;
  } catch (error) {
    console.error('GC_EXPORT_AUDIT_FAILED: ' + String(error?.message || 'INVALID_INPUT'));
    process.exitCode = 1;
  }
}

module.exports = { auditGcExportPayload };
