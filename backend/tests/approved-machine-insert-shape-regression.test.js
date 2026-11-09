'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../models/productionTempApprovalModel.js'), 'utf8');
const valuesStart = source.indexOf('function buildApprovedMachineLineValues(');
const valuesEnd = source.indexOf('function verifyApprovedMachineLineCopy(', valuesStart);
const insertStart = source.indexOf('function buildApprovedMachineDefectsInsert(');
const insertEnd = source.indexOf('function buildApprovedMachineLinesRead(', insertStart);
assert.ok(valuesStart >= 0 && valuesEnd > valuesStart && insertStart >= 0 && insertEnd > insertStart);
const ctx = {
  storedStandardSource: (value) => value ?? null,
  serializeExtraData: (value) => value == null ? null : JSON.stringify(value),
};
vm.runInNewContext(source.slice(valuesStart, valuesEnd) + '\n' + source.slice(insertStart, insertEnd), ctx);
const machineInsert = vm.runInNewContext('buildApprovedMachineLinesInsert', ctx);
const defectInsert = vm.runInNewContext('buildApprovedMachineDefectsInsert', ctx);

test('machine-line bulk insert aligns 21 columns and 21 parameters per line', () => {
  const lines = [
    { machine_code: 'M-1', product_code: 'P-1', machine_time_hours: '2.500000', standard_output: '80', ok_quantity: 70, ng_quantity: 3, maximum_output: 80, sort_order: 1, standard_source: 'machine' },
    { machine_code: 'M-2', product_code: 'P-2', machine_time_hours: '1.250000', standard_output: '60', ok_quantity: 51, ng_quantity: 2, maximum_output: 60, sort_order: 2, standard_source: 'product' },
  ];
  const { sql, params } = machineInsert(lines, 88);
  const columns = sql.match(/INSERT INTO production_report_machine_lines \(([^)]+)\)/i);
  assert.ok(columns);
  assert.equal(columns[1].split(',').length, 21);
  assert.equal((sql.match(/\?/g) || []).length, 42);
  assert.equal(params.length, 42);
  assert.equal(params[0], 88);
  assert.equal(params[3], 'M-1');
  assert.equal(params[7], 'P-1');
  assert.equal(params[21], 88);
  assert.equal(params[24], 'M-2');
  assert.equal(params[28], 'P-2');
  assert.equal(params[8], '2.500000');
  assert.equal(params[29], '1.250000');
});

test('machine defect bulk insert aligns five columns and parameters for multiple defects', () => {
  const rows = [[201, 3, 'NG1', 'Scratch', 2], [202, 4, 'NG2', 'Crack', 1]];
  const { sql, params } = defectInsert(rows);
  assert.match(sql, /INSERT INTO production_report_machine_defects\s*\(machine_line_id,defect_type_id,defect_code,defect_name,quantity\)/i);
  assert.equal((sql.match(/\?/g) || []).length, 10);
  assert.deepEqual(Array.from(params), rows.flat());
});

test('machine-line insert preserves report lineage and decimal-string quantity', () => {
  const { params } = machineInsert([{ machine_code: 'M-3', product_code: 'P-3', machine_time_hours: '0.125000', standard_output: '10.500000', ok_quantity: 9, ng_quantity: 1, maximum_output: 11, sort_order: 3 }], 777);
  assert.equal(params.length, 21);
  assert.equal(params[0], 777);
  assert.equal(params[8], '0.125000');
  assert.equal(params[9], '10.500000');
  assert.equal(params[20], 3);
});
