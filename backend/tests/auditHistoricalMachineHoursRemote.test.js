'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyReport, monthList, auditMachineHours } = require('../scripts/auditHistoricalMachineHoursRemote.cjs');

test('monthList includes the cutoff month and spans year boundaries', () => {
  assert.deepEqual(monthList('2025-11', '2026-10-08'), [
    '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04',
    '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'
  ]);
});

test('monthList rejects invalid start month', () => {
  assert.throws(() => monthList('2026-13', '2026-10-08'), /month must be 01-12/);
});

test('single machine line with missing hours and valid worker time still requires review, not auto-inference', () => {
  // Worker total/actual time is not proof of physical machine time, even when
  // there is exactly one machine line (commit 13c178f6, "Prevent worker-time
  // inference in historical machine audit"). Auto-classifying this as eligible
  // for backfill would let an unverified worker-entered duration stand in for
  // the machine's real run time, so this must stay REVIEW until an approved
  // physical event or trusted machine-time source confirms the value.
  const result = classifyReport({
    id: 10, work_date: '2026-09-01', total_time: 8, deduction_time: 1,
    operation_mode: 'MACHINE', machineLines: [{ id: 20, machine_code: 'GC01', machine_time_hours: 0 }]
  });
  // Current policy (see classifyReport): worker time is not proof of physical machine time,
  // so even a single machine line with missing hours is never auto-qualified.
  assert.equal(result.action, 'REVIEW');
  assert.equal(result.reason, 'MACHINE_LINE_WITHOUT_PHYSICAL_EVENT');
});

test('multi-machine allocation is flagged for review, not auto-split', () => {
  const result = classifyReport({
    id: 11, work_date: '2026-09-02', total_time: 8, deduction_time: 1,
    operation_mode: 'MACHINE', machineLines: [
      { id: 21, machine_code: 'GC01', machine_time_hours: 0 },
      { id: 22, machine_code: 'GC02', machine_time_hours: 0 }
    ]
  });
  assert.equal(result.action, 'REVIEW');
  assert.equal(result.reason, 'MULTI_MACHINE_ALLOCATION_REQUIRES_CONFIRMATION');
});

test('machine report without machine lines is flagged for review', () => {
  const result = classifyReport({ id: 12, work_date: '2026-09-03', total_time: 8, operation_mode: 'MACHINE', machineLines: [] });
  assert.equal(result.action, 'REVIEW');
  assert.equal(result.reason, 'MACHINE_REPORT_WITHOUT_MACHINE_LINES');
});

test('machine hours over 12 are preserved and flagged for review', () => {
  const result = classifyReport({
    id: 13, work_date: '2026-09-04', total_time: 8, deduction_time: 0,
    operation_mode: 'MACHINE', machineLines: [{ id: 23, machine_code: 'GC01', machine_time_hours: 13 }]
  });
  assert.equal(result.action, 'REVIEW');
  assert.equal(result.reason, 'MACHINE_LINE_OR_PHYSICAL_EVENT_HOURS_OVER_12_HOURS');
});


test('worker hours, machine-line hours and approved physical event hours remain separate', () => {
  const report = {
    id: 30,
    total_time: 7.5,
    machineLines: [
      { id: 301, machine_code: 'GC01', machine_time_hours: 4, machine_event_id: 9001 },
      { id: 302, machine_code: 'GC01', machine_time_hours: 3.5, machine_event_id: 9001 }
    ],
    eventLines: [{ id: 9001, machine_time_hours: 6, status: 'approved' }]
  };

  const audit = auditMachineHours(report);
  assert.equal(audit.worker_hours, 7.5);
  assert.equal(audit.machine_line_hours_total, 7.5);
  assert.equal(audit.physical_machine_hours_confirmed, 6);
  assert.equal(audit.physical_machine_hours_complete, true);
  assert.equal(audit.unique_approved_event_count, 1);
  assert.equal(audit.duplicate_event_links, 1);
  assert.equal(audit.lines[1].physical_hours_counted_for_this_line, 0);
});

test('linked event missing from approved eventLines is REVIEW and never falls back to line hours', () => {
  const result = classifyReport({
    id: 31,
    total_time: 8,
    deduction_time: 0,
    operation_mode: 'MACHINE',
    machineLines: [
      { id: 311, machine_code: 'GC01', machine_time_hours: 8, machine_event_id: 9901 }
    ],
    eventLines: []
  });

  assert.equal(result.action, 'REVIEW');
  assert.equal(result.reason, 'LINKED_MACHINE_EVENT_MISSING_OR_NOT_APPROVED');
  assert.equal(result.machine_hours_audit.machine_line_hours_total, 8);
  assert.equal(result.machine_hours_audit.physical_machine_hours_confirmed, 0);
  assert.equal(result.machine_hours_audit.physical_machine_hours_complete, false);
});

test('line hours without event link are not reported as physical machine hours', () => {
  const audit = auditMachineHours({
    total_time: 5,
    machineLines: [{ id: 321, machine_time_hours: 5 }],
    eventLines: []
  });

  assert.equal(audit.worker_hours, 5);
  assert.equal(audit.machine_line_hours_total, 5);
  assert.equal(audit.physical_machine_hours_confirmed, 0);
  assert.equal(audit.physical_machine_hours_source, 'NO_APPROVED_MACHINE_EVENTS');
  assert.equal(audit.machine_lines_without_event_count, 1);
});


test('rejected linked event is not treated as physical machine time', () => {
  const result = classifyReport({
    id: 32,
    total_time: 8,
    deduction_time: 0,
    operation_mode: 'MACHINE',
    machineLines: [{ id: 321, machine_code: 'GC01', machine_time_hours: 8, machine_event_id: 9902 }],
    eventLines: [{ id: 9902, machine_time_hours: 8, status: 'rejected' }],
    machineAccounting: {
      source: 'MACHINE_EVENT_MISSING',
      grossHours: 0,
      deductionHours: 0,
      netHours: 0
    }
  });

  assert.equal(result.action, 'REVIEW');
  assert.equal(result.reason, 'LINKED_MACHINE_EVENT_NOT_APPROVED');
  assert.equal(result.machine_hours_audit.physical_machine_hours_confirmed, 0);
  assert.equal(result.machine_hours_audit.non_approved_linked_event_count, 1);
});

test('approved event can confirm physical hours even when machine-line hours are zero', () => {
  const result = classifyReport({
    id: 33,
    total_time: 8,
    deduction_time: 0,
    operation_mode: 'MACHINE',
    machineLines: [{ id: 331, machine_code: 'GC01', machine_time_hours: 0, machine_event_id: 9903 }],
    eventLines: [{ id: 9903, machine_time_hours: 8, status: 'approved' }],
    machineAccounting: {
      source: 'MACHINE_EVENT',
      grossHours: 8,
      deductionHours: 0,
      netHours: 8
    }
  });

  assert.equal(result.action, 'NO_CHANGE');
  assert.equal(result.reason, 'APPROVED_MACHINE_EVENTS_CONFIRMED_PHYSICAL_TIME');
  assert.equal(result.machine_hours_audit.machine_line_hours_total, 0);
  assert.equal(result.machine_hours_audit.physical_machine_hours_confirmed, 8);
  assert.equal(result.machine_hours_audit.machine_accounting_comparison.status, 'MATCH');
});

test('multiple machine lines with distinct approved events reconcile to machineAccounting', () => {
  const result = classifyReport({
    id: 34,
    total_time: 8,
    deduction_time: 0,
    operation_mode: 'MACHINE',
    machineLines: [
      { id: 341, machine_code: 'GC01', machine_time_hours: 4, machine_event_id: 9911 },
      { id: 342, machine_code: 'GC02', machine_time_hours: 4, machine_event_id: 9912 }
    ],
    eventLines: [
      { id: 9911, machine_time_hours: 4, status: 'approved' },
      { id: 9912, machine_time_hours: 4, status: 'approved' }
    ],
    machineAccounting: {
      source: 'MACHINE_EVENT',
      grossHours: 8,
      deductionHours: 0,
      netHours: 8
    }
  });

  assert.equal(result.action, 'NO_CHANGE');
  assert.equal(result.machine_hours_audit.physical_machine_hours_confirmed, 8);
  assert.equal(result.machine_hours_audit.machine_accounting_comparison.status, 'MATCH');
});

test('machineAccounting mismatch is REVIEW even when event links are approved', () => {
  const result = classifyReport({
    id: 35,
    total_time: 8,
    deduction_time: 0,
    operation_mode: 'MACHINE',
    machineLines: [{ id: 351, machine_code: 'GC01', machine_time_hours: 8, machine_event_id: 9921 }],
    eventLines: [{ id: 9921, machine_time_hours: 8, status: 'approved' }],
    machineAccounting: {
      source: 'MACHINE_EVENT',
      grossHours: 7,
      deductionHours: 0,
      netHours: 7
    }
  });

  assert.equal(result.action, 'REVIEW');
  assert.equal(result.reason, 'MACHINE_ACCOUNTING_DOES_NOT_MATCH_EVENT_AND_LINE_SOURCES');
  assert.equal(result.machine_hours_audit.machine_accounting_comparison.status, 'MISMATCH');
});

test('non-machine report with no machine lines remains NO_CHANGE', () => {
  const result = classifyReport({
    id: 36,
    total_time: 7,
    deduction_time: 0,
    operation_mode: 'MANUAL',
    machine_no: '',
    machineLines: []
  });

  assert.equal(result.action, 'NO_CHANGE');
  assert.equal(result.reason, 'NO_MACHINE_USE_WORKER_TIME');
});


test('shared approved event is counted once and does not force the main action to REVIEW', () => {
  const result = classifyReport({
    id: 37,
    total_time: 8,
    deduction_time: 0,
    operation_mode: 'MACHINE',
    machineLines: [
      { id: 371, machine_code: 'GC01', machine_time_hours: 4, machine_event_id: 9931 },
      { id: 372, machine_code: 'GC01', machine_time_hours: 4, machine_event_id: 9931 }
    ],
    eventLines: [{ id: 9931, machine_time_hours: 6, status: 'approved' }],
    machineAccounting: {
      source: 'MACHINE_EVENT',
      grossHours: 6,
      deductionHours: 0,
      netHours: 6
    }
  });

  assert.equal(result.action, 'NO_CHANGE');
  assert.equal(result.machine_hours_audit.physical_machine_hours_confirmed, 6);
  assert.equal(result.machine_hours_audit.duplicate_event_links, 1);
  assert.equal(result.machine_hours_audit.machine_accounting_comparison.status, 'MATCH');
  // Deduction reconciliation is a separate axis and can remain REVIEW.
  assert.equal(result.machine_deduction_audit.status, 'REVIEW');
});

test('MACHINE report without machineAccounting payload remains REVIEW', () => {
  const result = classifyReport({
    id: 38,
    total_time: 8,
    deduction_time: 0,
    operation_mode: 'MACHINE',
    machineLines: [{ id: 381, machine_code: 'GC01', machine_time_hours: 0, machine_event_id: 9941 }],
    eventLines: [{ id: 9941, machine_time_hours: 8, status: 'approved' }]
  });

  assert.equal(result.action, 'REVIEW');
  assert.equal(result.reason, 'MACHINE_ACCOUNTING_PAYLOAD_MISSING');
});


test('partial physical event coverage is REVIEW and only approved event hours are counted', () => {
  const result = classifyReport({
    id: 39,
    total_time: 8,
    deduction_time: 0,
    operation_mode: 'MACHINE',
    machineLines: [
      { id: 391, machine_code: 'GC01', machine_time_hours: 4, machine_event_id: 9951 },
      { id: 392, machine_code: 'GC02', machine_time_hours: 4, machine_event_id: 9952 }
    ],
    eventLines: [{ id: 9951, machine_time_hours: 4, status: 'approved' }],
    machineAccounting: {
      source: 'MACHINE_EVENT_PARTIAL',
      grossHours: 4,
      deductionHours: 0,
      netHours: 4
    }
  });

  assert.equal(result.action, 'REVIEW');
  assert.equal(result.reason, 'LINKED_MACHINE_EVENT_MISSING_OR_NOT_APPROVED');
  assert.equal(result.machine_hours_audit.physical_machine_hours_confirmed, 4);
  assert.equal(result.machine_hours_audit.physical_machine_hours_complete, false);
  assert.equal(result.machine_hours_audit.machine_accounting_comparison.status, 'MATCH');
});

test('legacy machine-line fallback reconciles accounting but remains REVIEW for physical truth', () => {
  const result = classifyReport({
    id: 40,
    total_time: 8,
    deduction_time: 0,
    operation_mode: 'MACHINE',
    machineLines: [{
      id: 401,
      machine_code: 'GC01',
      machine_time_hours: 8,
      excel_machine_time_hours: 8,
      machine_event_id: null,
      deduction_time_hours: 0,
      deductions_json: '[]'
    }],
    eventLines: [],
    machineAccounting: {
      source: 'MACHINE_LINE',
      grossHours: 8,
      deductionHours: 0,
      netHours: 8
    }
  });

  assert.equal(result.action, 'REVIEW');
  assert.equal(result.reason, 'MACHINE_LINE_WITHOUT_PHYSICAL_EVENT');
  assert.equal(result.machine_hours_audit.machine_accounting_comparison.status, 'MATCH');
  assert.equal(result.machine_hours_audit.physical_machine_hours_confirmed, 0);
  assert.equal(result.machine_hours_audit.machine_line_hours_total, 8);
});
