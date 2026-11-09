'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../models/productionTempApprovalModel.js'), 'utf8');
function extract(name, nextMarker, context = {}) {
  const start = source.indexOf('function ' + name + '(');
  const end = source.indexOf(nextMarker, start);
  assert.ok(start >= 0 && end > start, name + ' must exist');
  return vm.runInNewContext(source.slice(start, end) + '\n' + name + ';', context);
}
const payload = extract('buildLegacyApprovedSnapshotPayload', 'async function createLegacyApprovedSnapshot(');
const insert = extract('buildApprovedReportInsertValues', 'module.exports = {', {
  serializeExtraData: (value) => JSON.stringify(value),
});

test('legacy snapshot preserves all report fields and source references', () => {
  const item = {
    id: 31, worker_id: 7, process_id: 1, work_date: '2026-10-30',
    shift: 'A', product_name: 'P1', total_time: '12.5', actual_time: null,
    deduction_time: '1.5', standard_output: '80.25', actual_output: '100',
    tt_ok: '99', tt_ng: 1, standard_version_id: 0, machine_standard_id: 9,
    training_percent_snapshot: '75.00',
  };
  const defects = [{ defect_code: 'NG', quantity: 1 }];
  const deductions = [{ hours: 1 }];
  const lines = [{ machine_code: 'M1' }];
  const result = payload(item, 48, defects, deductions, lines);
  assert.deepEqual({ ...result.report }, {
    id: 48, source_temp_id: 31, worker_id: 7, process_id: 1,
    work_date: '2026-10-30', entry_date: '2026-10-30', shift: 'A',
    operation_type: null, operation_mode: null, machine_no: undefined,
    product_code: 'P1', total_time: 12.5, actual_time: 0, deduction_time: 1.5,
    standard_output: 80.25, actual_output: 100, tt_ok: 99, tt_ng: 1,
    standard_version_id: null, machine_standard_id: 9,
    training_percent_snapshot: '75.00',
  });
  assert.strictEqual(result.defects, defects);
  assert.strictEqual(result.deductions, deductions);
  assert.strictEqual(result.machineLines, lines);
  assert.equal(Object.keys(result.report).length, 21);
});

test('legacy snapshot retains numeric defaults, date fallback and explicit nulls', () => {
  const item = { work_date: '2026-11-01', entry_date: '', operation_type: 0,
    operation_mode: '', standard_output: null, training_percent_snapshot: 0 };
  const report = payload(item, 0, [], [], []).report;
  assert.equal(report.entry_date, '2026-11-01');
  assert.equal(report.operation_type, 0);
  assert.equal(report.operation_mode, '');
  assert.equal(report.standard_output, 0);
  assert.equal(report.training_percent_snapshot, 0);
  assert.equal(report.standard_version_id, null);
  assert.equal(report.machine_standard_id, null);
});

test('approved insert preserves 37 positional values and special defaults', () => {
  const item = { id: 11, worker_id: 2, process_id: 1, work_date: '2026-10-30',
    entry_date: '', shift: 'B', operation_type: 0, operation_mode: '',
    machine_no: 'M1', product_name: 'P1', standard_version_id: 0,
    machine_standard_id: null, training_percent_snapshot: 0,
    extra_data: { flag: true }, review_note: 'ok' };
  const values = Array.from(insert(item, 19));
  assert.equal(values.length, 37);
  assert.deepEqual(values.slice(0, 10), [11, 2, 1, '2026-10-30', '2026-10-30', 'B', 0, '', 'M1', 'P1']);
  assert.equal(values[14], null);
  assert.equal(values[15], null);
  assert.equal(values[16], 0);
  assert.equal(values[33], '{"flag":true}');
  assert.equal(values[34], 'approved');
  assert.equal(values[35], 'ok');
  assert.equal(values[36], 19);
});

test('approval uses extracted payload and INSERT without changing SQL', () => {
  const legacy = source.slice(source.indexOf('async function createLegacyApprovedSnapshot('), source.indexOf('module.exports = {'));
  assert.match(legacy, /JSON\.stringify\(buildLegacyApprovedSnapshotPayload\(item, approvedReportId, snapshotDefects, snapshotDeductions, machineLines\)\)/);
  const approval = source.slice(source.indexOf('async approveSelected('));
  assert.match(approval, /buildApprovedReportInsertValues\(item, reviewerId\)/);
  assert.match(approval, /INSERT INTO production_reports/);
  assert.match(approval, /NOW\(\)/);
});
