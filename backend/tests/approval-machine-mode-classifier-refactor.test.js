'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../models/productionTempApprovalModel.js'), 'utf8');
const start = source.indexOf('function isMachineApprovalReport(');
const end = source.indexOf('async function validateApprovalSnapshot(', start);
assert.ok(start >= 0 && end > start);
const classify = vm.runInNewContext(source.slice(start, end) + '\nisMachineApprovalReport;', {});

test('machine mode detection preserves exact uppercase coercion and no trim', () => {
  for (const mode of ['MACHINE', 'machine', 'Machine', 'MaChInE']) {
    assert.equal(classify({ operation_mode: mode }), true);
  }
  for (const mode of [' MACHINE', 'MACHINE ', '', null, undefined, 0, false, 'PRODUCT', 'AUTO']) {
    assert.equal(classify({ operation_mode: mode }), false);
  }
});

test('machine mode detection preserves non-string truthy conversion', () => {
  for (const mode of [1, true, {}, ['MACHINE'], ['MACHINE', 'PRODUCT']]) {
    const expected = String(mode || '').toUpperCase() === 'MACHINE';
    assert.equal(classify({ operation_mode: mode }), expected);
  }
  assert.equal(classify({}), false);
});

test('approval dispatcher uses extracted mode classifier without changing non-product routing', () => {
  const a = source.indexOf('async function validateApprovalSnapshot(');
  const b = source.indexOf('async function createLegacyApprovedSnapshot(', a);
  const validate = source.slice(a, b);
  assert.match(validate, /const isMachineReport = isMachineApprovalReport\(item\)/);
  assert.match(validate, /if \(!isMachineReport && isParentProcessNonProductWork\(item\)\)/);
  assert.match(validate, /await validateMachineApprovalSnapshot\(item, connection, standardResolver, tempLinesCache\)/);
});
