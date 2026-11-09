'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../models/productionTempApprovalModel.js'), 'utf8');
const start = source.indexOf('function buildReportStandardResolutionInput(');
const end = source.indexOf('async function validateApprovalSnapshot(', start);
assert.ok(start >= 0 && end > start, 'report standard resolution helper exists');

const gcCalls = [];
const build = vm.runInNewContext(source.slice(start, end) + '\nbuildReportStandardResolutionInput;', {
  explicitGcWorkType: (args) => { gcCalls.push(args); return args.isGc ? 'GC_MANUAL' : null; },
});

test('report-level resolution retains six fields and exact saved values', () => {
  const report = {
    process_id: 1, product_name: 'P1', work_date: '2026-10-30',
    standard_version_id: 15, machine_standard_id: null, operation_type: 'LONG',
    standard_output: '99.00',
  };
  const result = { ...build(report) };
  assert.deepEqual(result, {
    processId: 1, productCode: 'P1', workDate: '2026-10-30',
    standardVersionId: 15, machineStandardId: null, workType: 'GC_MANUAL',
  });
  assert.deepEqual({ ...gcCalls.at(-1) }, { isGc: true, operationType: 'LONG' });
});

test('GC work type is explicitly resolved for other processes and numeric-string IDs', () => {
  for (const process_id of [2, '1', null, undefined, 1]) {
    const report = { process_id, product_name: null, standard_version_id: undefined };
    const input = { ...build(report) };
    assert.equal(input.processId, process_id);
    assert.equal(input.productCode, null);
    assert.equal(input.standardVersionId, undefined);
    assert.equal(input.workType, Number(process_id) === 1 ? 'GC_MANUAL' : null);
    assert.deepEqual({ ...gcCalls.at(-1) }, { isGc: Number(process_id) === 1, operationType: undefined });
  }
});

test('report approval calls extracted resolver arguments only for non-machine reports', () => {
  const a = source.indexOf('async function validateApprovalSnapshot(');
  const b = source.indexOf('async function createLegacyApprovedSnapshot(', a);
  const validate = source.slice(a, b);
  assert.match(validate, /standardResolver\.resolveStandard\(buildReportStandardResolutionInput\(item\)\)/);
  assert.match(validate, /await validateMachineApprovalSnapshot\(item, connection, standardResolver, tempLinesCache\)/);
  assert.match(validate, /hasNonProductSnapshotMismatch\(item\)/);
});
