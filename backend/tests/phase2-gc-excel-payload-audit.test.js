'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { auditGcExportPayload } = require('../scripts/auditGcExcelPayload.cjs');

const event = { id: 901, machine_code: 'C2556-2', work_date: '2026-10-30', shift: 'A', machine_time_hours: 8 };
const row = (id, workerCode, eventId = 901, extra = {}) => ({
  id,
  status: 'approved',
  dataSource: 'production_reports',
  isApprovedDatabaseRecord: true,
  worker_code: workerCode,
  operation_mode: 'MACHINE',
  machineLines: [{ id: id * 10, machine_event_id: eventId, machine_time_hours: 8, deduction_time_hours: 0, deductions_json: '[]' }],
  eventLines: eventId ? [event] : [],
  machineAccounting: { source: 'MACHINE_EVENT', grossHours: 8, deductionHours: 0, netHours: 8 },
  ...extra,
});
const envelope = (reports) => ({
  success: true,
  data: {
    dataSource: 'tidb.production_reports.approved',
    processes: { GC: { reports } },
  },
});

test('same physical event shared by two workers is counted ONCE in physical totals', () => {
  const result = auditGcExportPayload(envelope([
    row(1001, 'W001'),
    row(1002, 'W002'),
  ]), { requireSharedEvent: true });
  assert.equal(result.passed, true, result.errors.join(', '));
  assert.equal(result.stats.machineReports, 2);
  assert.equal(result.stats.verifiedMachineReports, 2);
  assert.equal(result.stats.uniqueLinkedPhysicalEvents, 1);
  assert.equal(result.stats.sharedPhysicalEventsAcrossReports, 1);
  assert.equal(result.stats.sharedWorkerLinks, 1);
  assert.equal(result.stats.uniquePhysicalEventHours, 8, 'two worker credits are not 16 hours of physical machine time');
  assert.equal(JSON.stringify(result).includes('W001'), false, 'no worker identity in audit output');
});

test('two independent machine events contribute two distinct physical durations', () => {
  const another = { ...event, id: 902, machine_time_hours: 6 };
  const result = auditGcExportPayload(envelope([
    row(1001, 'W001'),
    row(1002, 'W002', 902, {
      eventLines: [another],
      machineAccounting: { source: 'MACHINE_EVENT', grossHours: 6, deductionHours: 0, netHours: 6 },
    }),
  ]));
  assert.equal(result.passed, true, result.errors.join(', '));
  assert.equal(result.stats.uniqueLinkedPhysicalEvents, 2);
  assert.equal(result.stats.uniquePhysicalEventHours, 14);
  assert.deepEqual(result.warnings, ['NO_SHARED_MACHINE_EVENT_SAMPLE']);
});

test('tampered report accounting cannot be treated as a passing Excel export', () => {
  const result = auditGcExportPayload(envelope([
    row(1001, 'W001', 901, {
      machineAccounting: { source: 'MACHINE_EVENT', grossHours: 16, deductionHours: 0, netHours: 16 }
    }),
  ]));
  assert.equal(result.passed, false);
  assert.ok(result.errors.includes('GC_ACCOUNTING_MISMATCH'));
});

test('unapproved or untrusted report provenance is rejected', () => {
  const result = auditGcExportPayload(envelope([
    row(1001, 'W001', 901, { status: 'pending', isApprovedDatabaseRecord: false }),
  ]));
  assert.equal(result.passed, false);
  assert.ok(result.errors.includes('UNVERIFIED_APPROVED_REPORT_PROVENANCE'));
  assert.throws(() => auditGcExportPayload({ data: { processes: { GC: { reports: [] } } } }), /INVALID_APPROVED_COMPANY_DATA_ENVELOPE/);
});

test('missing linked physical event fails closed instead of borrowing worker time', () => {
  const result = auditGcExportPayload(envelope([
    row(1001, 'W001', 901, {
      eventLines: [],
      machineAccounting: { source: 'MACHINE_EVENT_MISSING', grossHours: 0, deductionHours: 0, netHours: 0 },
    }),
  ]));
  assert.equal(result.passed, false);
  assert.ok(result.errors.includes('GC_LINKED_EVENT_NOT_IN_EXPORT'));
  assert.ok(result.errors.includes('GC_MISSING_LINKED_PHYSICAL_EVENT'));
});

test('shared event must have consistent physical hours across all worker reports', () => {
  const result = auditGcExportPayload(envelope([
    row(1001, 'W001'),
    row(1002, 'W002', 901, {
      eventLines: [{ ...event, machine_time_hours: 10 }],
      machineAccounting: { source: 'MACHINE_EVENT', grossHours: 10, deductionHours: 0, netHours: 10 },
    }),
  ]), { requireSharedEvent: true });
  assert.equal(result.passed, false);
  assert.ok(result.errors.includes('GC_SHARED_EVENT_INCONSISTENT_ACROSS_WORKERS'));
});

test('shared-machine sample can be made mandatory before certifying an Excel month', () => {
  const result = auditGcExportPayload(envelope([row(1001, 'W001')]), { requireSharedEvent: true });
  assert.equal(result.passed, false);
  assert.ok(result.errors.includes('REQUIRED_SHARED_MACHINE_SAMPLE_MISSING'));
});

test('duplicate physical event IDs in a single report fail closed instead of silently overwriting', () => {
  const result = auditGcExportPayload(envelope([
    row(1001, 'W001', 901, {
      eventLines: [event, { ...event, machine_time_hours: 10 }],
    }),
  ]));
  assert.equal(result.passed, false);
  assert.ok(result.errors.includes('GC_DUPLICATE_PHYSICAL_EVENT_ID_IN_REPORT'));
});

test('even identical duplicate physical event IDs are rejected as ambiguous export data', () => {
  const result = auditGcExportPayload(envelope([
    row(1001, 'W001', 901, {
      eventLines: [event, { ...event }],
    }),
  ]));
  assert.equal(result.passed, false);
  assert.ok(result.errors.includes('GC_DUPLICATE_PHYSICAL_EVENT_ID_IN_REPORT'));
});

test('invalid physical event IDs are rejected rather than hidden by Map filtering', () => {
  const result = auditGcExportPayload(envelope([
    row(1001, 'W001', 901, {
      eventLines: [event, { ...event, id: 'invalid' }],
    }),
  ]));
  assert.equal(result.passed, false);
  assert.ok(result.errors.includes('GC_INVALID_PHYSICAL_EVENT_ID'));
});

test('malformed nonempty machine event references fail instead of becoming unlinked lines', () => {
  for (const badId of ['not-an-event', -1, 1.5, '9007199254740993']) {
    const result = auditGcExportPayload(envelope([
      row(1001, 'W001', 901, {
        machineLines: [{ id: 10010, machine_event_id: badId, machine_time_hours: 8, deduction_time_hours: 0, deductions_json: '[]' }],
        eventLines: [],
        machineAccounting: { source: 'MACHINE_LINE', grossHours: 8, deductionHours: 0, netHours: 8 },
      }),
    ]));
    assert.equal(result.passed, false, String(badId));
    assert.ok(result.errors.includes('GC_INVALID_MACHINE_EVENT_REFERENCE'), String(badId));
  }
});

test('legacy unlinked machine line is not rejected solely for a null event reference', () => {
  const result = auditGcExportPayload(envelope([
    row(1001, 'W001', 901, {
      machineLines: [{ id: 10010, machine_event_id: null, machine_time_hours: 8, deduction_time_hours: 0, deductions_json: '[]' }],
      eventLines: [],
      machineAccounting: { source: 'MACHINE_LINE', grossHours: 8, deductionHours: 0, netHours: 8 },
    }),
  ]));
  assert.equal(result.passed, true, result.errors.join(', '));
});

test('linked event on a different production date is rejected', () => {
  const result = auditGcExportPayload(envelope([
    row(1001, 'W001', 901, { work_date: '2026-10-31', shift: 'A' }),
  ]));
  assert.equal(result.passed, false);
  assert.ok(result.errors.includes('GC_EVENT_REPORT_DATE_MISMATCH'));
});

test('linked event on a different shift is rejected', () => {
  const result = auditGcExportPayload(envelope([
    row(1001, 'W001', 901, { work_date: '2026-10-30', shift: 'B' }),
  ]));
  assert.equal(result.passed, false);
  assert.ok(result.errors.includes('GC_EVENT_REPORT_SHIFT_MISMATCH'));
});

test('linked event with matching date and shift remains valid', () => {
  const result = auditGcExportPayload(envelope([
    row(1001, 'W001', 901, { work_date: '2026-10-30', shift: 'A' }),
  ]));
  assert.equal(result.passed, true, result.errors.join(', '));
});
