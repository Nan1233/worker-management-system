'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../models/productionTempApprovalModel.js'), 'utf8');
const start = source.indexOf('function buildLegacySnapshotDefects(');
const end = source.indexOf('function buildLegacyApprovedSnapshotPayload(', start);
assert.ok(start >= 0 && end > start);
const ctx = {};
vm.runInNewContext(source.slice(start, end), ctx);
const defects = vm.runInNewContext('buildLegacySnapshotDefects', ctx);
const deductions = vm.runInNewContext('buildLegacySnapshotDeductions', ctx);

test('preloaded defects project only the three legacy snapshot fields, in original order', () => {
  const rows = [{ defect_code: 'A', defect_name: 'Scratch', quantity: 2, id: 99 },
    { defect_code: null, quantity: 0 }];
  assert.deepEqual(Array.from(defects(rows), (x) => ({ ...x })), [
    { defect_code: 'A', defect_name: 'Scratch', quantity: 2 },
    { defect_code: null, defect_name: undefined, quantity: 0 },
  ]);
  assert.deepEqual(rows[0], { defect_code: 'A', defect_name: 'Scratch', quantity: 2, id: 99 });
});

test('preloaded deductions project only code, name and hours without coercion', () => {
  const rows = [{ deduction_code: '5S', deduction_name: '5S', hours: '0.50', extra: 1 },
    { deduction_code: '', deduction_name: null, hours: undefined }];
  assert.deepEqual(Array.from(deductions(rows), (x) => ({ ...x })), [
    { deduction_code: '5S', deduction_name: '5S', hours: '0.50' },
    { deduction_code: '', deduction_name: null, hours: undefined },
  ]);
});

test('empty projections and preloaded snapshot callsites retain order and SQL fallback', () => {
  assert.equal(defects([]).length, 0);
  assert.equal(deductions([]).length, 0);
  const legacy = source.slice(source.indexOf('async function createLegacyApprovedSnapshot('), source.indexOf('function buildApprovedReportInsertValues('));
  assert.match(legacy, /preloaded\.defects\s*\?\s*buildLegacySnapshotDefects\(preloaded\.defects\)/);
  assert.match(legacy, /preloaded\.deductions\s*\?\s*buildLegacySnapshotDeductions\(preloaded\.deductions\)/);
  assert.match(legacy, /FROM production_report_defects/);
  assert.match(legacy, /FROM production_report_deductions/);
});
