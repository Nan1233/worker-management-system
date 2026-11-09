'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../models/productionTempApprovalModel.js'), 'utf8');
const start = source.indexOf('function buildApprovedDetailCopyQuery(');
const end = source.indexOf('function buildApprovedVersionRequest(', start);
assert.ok(start >= 0 && end > start, 'approved detail query builders must exist');
const context = {};
vm.runInNewContext(source.slice(start, end), context);
const buildCopy = vm.runInNewContext('buildApprovedDetailCopyQuery', context);
const buildRead = vm.runInNewContext('buildApprovedDetailReadQuery', context);

test('approved defect copy stays scoped to one temp report and preserves quantities', () => {
  const { sql, params } = buildCopy('defects', 91, 17);
  assert.match(sql, /INSERT INTO production_report_defects\s*\(report_id,defect_type_id,quantity\)/i);
  assert.match(sql, /SELECT \?,defect_type_id,quantity FROM production_temp_defects WHERE temp_report_id=\?/i);
  assert.deepEqual(Array.from(params), [91, 17]);
});

test('approved deduction copy stays scoped to one temp report and preserves hours', () => {
  const { sql, params } = buildCopy('deductions', 92, 18);
  assert.match(sql, /INSERT INTO production_report_deductions\s*\(report_id,deduction_type_id,hours\)/i);
  assert.match(sql, /SELECT \?,deduction_type_id,hours FROM production_temp_deductions WHERE temp_report_id=\?/i);
  assert.deepEqual(Array.from(params), [92, 18]);
});

test('approved detail reads are scoped to approved parent and ordered deterministically', () => {
  for (const [kind, table] of [['defects', 'production_report_defects'], ['deductions', 'production_report_deductions']]) {
    const { sql, params } = buildRead(kind, 99);
    assert.match(sql, new RegExp('FROM ' + table + ' d'));
    assert.match(sql, /WHERE d\.report_id=\? ORDER BY d\.id/i);
    assert.deepEqual(Array.from(params), [99]);
  }
});

test('unsupported detail kinds fail closed instead of copying another table', () => {
  for (const kind of ['machine_lines', '', null, undefined, 'defect', 'deduction']) {
    assert.throws(() => buildCopy(kind, 91, 17), /Unsupported approved detail kind/);
    assert.throws(() => buildRead(kind, 91), /Unsupported approved detail kind/);
  }
});
