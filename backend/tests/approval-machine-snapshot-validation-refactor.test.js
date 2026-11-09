'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../models/productionTempApprovalModel.js'), 'utf8');
const start = source.indexOf('async function validateMachineApprovalSnapshot(');
const end = source.indexOf('async function validateApprovalSnapshot(', start);
assert.ok(start >= 0 && end > start, 'machine snapshot validation helper exists');

function makeValidator(lines, events) {
  const standardResolver = {
    warmUp: async (input) => { events.push(['warmUp', input.items.length]); },
    resolveStandard: async (input) => { events.push(['resolve', input.machineCode]); return { output: 100 }; },
  };
  const context = {
    getTempMachineLines: async (id) => { events.push(['load', id]); return lines; },
    prepareApprovedEventContext: async (_connection, data) => { events.push(['prepare', data.lines.length]); return { ready: true }; },
    buildMachineStandardWarmUpItems: (saved) => saved.map((line) => ({ machineId: line.machine_id, machineCode: line.machine_code, productCode: line.product_code })),
    assertApprovedEventForTempLine: async (_connection, data) => { events.push(['event', data.line.machine_code]); },
    buildMachineStandardResolutionInput: (_report, line) => ({ machineCode: line.machine_code }),
    buildStandardSnapshotConsistencyInput: (line, resolved) => ({ standardOutput: line.standard_output, resolved }),
    assertStandardSnapshotConsistency: (input) => { events.push(['snapshot', input.standardOutput]); },
  };
  const validate = vm.runInNewContext(source.slice(start, end) + '\nvalidateMachineApprovalSnapshot;', context);
  return { validate, standardResolver };
}

test('machine snapshot validation preserves load, cache, event and standard order', async () => {
  const events = [];
  const lines = [
    { machine_code: 'M1', standard_output: 50 },
    { machine_code: 'M2', standard_output: 60 },
  ];
  const { validate, standardResolver } = makeValidator(lines, events);
  const cache = new Map();
  await validate({ id: '41', process_id: 1, work_date: '2026-10-30' }, {}, standardResolver, cache);
  assert.strictEqual(cache.get(41), lines);
  assert.deepEqual(events, [
    ['load', '41'], ['prepare', 2], ['warmUp', 2],
    ['event', 'M1'], ['resolve', 'M1'], ['snapshot', 50],
    ['event', 'M2'], ['resolve', 'M2'], ['snapshot', 60],
  ]);
});

test('empty machine lines fail closed with existing public error before event checks', async () => {
  const events = [];
  const { validate, standardResolver } = makeValidator([], events);
  const cache = new Map();
  await assert.rejects(
    validate({ id: 22 }, {}, standardResolver, cache),
    (error) => error.status === 422 && error.code === 'STANDARD_SNAPSHOT_MISSING'
      && error.isPublic === true && error.message.includes('#22'),
  );
  assert.deepEqual(events, [['load', 22]]);
  assert.deepEqual(cache.get(22), []);
});

test('parent approval dispatcher calls machine validator and returns', () => {
  const dispatcher = source.slice(source.indexOf('async function validateApprovalSnapshot('), source.indexOf('async function createLegacyApprovedSnapshot('));
  assert.match(dispatcher, /await validateMachineApprovalSnapshot\(item, connection, standardResolver, tempLinesCache\)/);
  assert.match(dispatcher, /if \(!isMachineReport && isParentProcessNonProductWork\(item\)\)/);
  assert.match(dispatcher, /assertStandardSnapshotConsistency\(buildStandardSnapshotConsistencyInput\(item, resolved\)\)/);
});
