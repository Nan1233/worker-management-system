'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../models/productionTempApprovalModel.js'), 'utf8');
const begin = source.indexOf('function buildApprovedMachineLineValues(');
const end = source.indexOf('// Copies the temp machine lines', begin);
assert.ok(begin >= 0 && end > begin, 'machine line values helper exists');
const serializeExtraData = (value) => JSON.stringify(value);
const storedStandardSource = (value) => value === undefined ? null : value;
const buildValues = vm.runInNewContext(
  source.slice(begin, end) + '\nbuildApprovedMachineLineValues;',
  { serializeExtraData, storedStandardSource },
);

function previousValues(lines, approvedReportId) {
  return lines.flatMap((line) => [
    approvedReportId,
    line.machine_event_id || null,
    line.machine_id || null,
    line.machine_code,
    line.product_standard_id || null,
    line.standard_version_id || null,
    line.machine_standard_id || null,
    line.product_code,
    line.machine_time_hours,
    line.standard_output,
    line.standard_time_seconds || null,
    storedStandardSource(line.standard_source),
    line.ok_quantity,
    line.ng_quantity,
    line.maximum_output,
    line.deduction_time_hours || 0,
    serializeExtraData(line.deductions_json),
    line.counted_output || 0,
    line.earned_standard_hours || 0,
    serializeExtraData(line.defects_json),
    line.sort_order || 1,
  ]);
}

test('machine INSERT mapping preserves 21 columns and all defaults', () => {
  const lines = [
    { machine_code: 'M05', product_code: 'P1', machine_time_hours: 8, standard_output: 150,
      standard_source: 'PRODUCT', ok_quantity: 120, ng_quantity: 3, maximum_output: 160,
      deductions_json: [{ type: '5S', hours: 0.25 }], defects_json: { scratch: 3 }, sort_order: 2 },
    { machine_code: 'M06', product_code: 'P2', machine_event_id: 77, machine_id: 6,
      product_standard_id: 8, standard_version_id: 9, machine_standard_id: 10,
      machine_time_hours: 4, standard_output: 90, standard_time_seconds: 45,
      standard_source: 'MACHINE', ok_quantity: 80, ng_quantity: 1, maximum_output: 100,
      deduction_time_hours: 0.5, deductions_json: [], counted_output: 81,
      earned_standard_hours: 3.5, defects_json: [], sort_order: 1 },
  ];
  const actual = buildValues(lines, 999);
  assert.deepEqual(JSON.parse(JSON.stringify(actual)), previousValues(lines, 999));
  assert.equal(actual.length, 42);
  assert.equal(actual[0], 999);
  assert.equal(actual[21], 999);
});

test('machine INSERT mapping preserves empty input and falsy values', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(buildValues([], 2))), []);
  const lines = [{ machine_code: '', product_code: '', machine_event_id: 0,
    deduction_time_hours: 0, counted_output: 0, earned_standard_hours: 0,
    sort_order: 0, deductions_json: null, defects_json: null }];
  assert.deepEqual(JSON.parse(JSON.stringify(buildValues(lines, 3))), previousValues(lines, 3));
});

test('copy function retains single bulk INSERT and calls extracted mapper', () => {
  const start = source.indexOf('async function copyMachineLinesToApproved(');
  const endCopy = source.indexOf('function getExtraDataObject(', start);
  const copy = source.slice(start, endCopy);
  assert.match(copy, /buildApprovedMachineLineValues\(tempLines, approvedReportId\)/);
  assert.match(copy, /INSERT INTO production_report_machine_lines/);
  assert.equal((copy.match(/INSERT INTO production_report_machine_lines/g) || []).length, 1);
});
