'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const worker = path.join(__dirname, '../src/pages/worker');
const filename = path.join(worker, 'processSubmitBatchSlices.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  fileName: filename,
}).outputText;
const moduleRef = { exports: {} };
new Function('module', 'exports', compiled)(moduleRef, moduleRef.exports);
const { reportsUnsentAfterNetworkFailure, reportsAwaitingDuplicateConfirmation } = moduleRef.exports;
const reports = [
  { machine_code: 'M01', client_request_id: 'request-1', value: 10 },
  { machine_code: 'M02', client_request_id: 'request-2', value: 20 },
  { machine_code: 'M03', client_request_id: 'request-3', value: 30 },
];

test('network failure includes unknown current report but excludes confirmed predecessors', () => {
  const remaining = reportsUnsentAfterNetworkFailure(reports, 1);
  assert.deepEqual(remaining.map(x => x.client_request_id), ['request-2', 'request-3']);
  assert.strictEqual(remaining[0], reports[1], 'retain request IDs and payload references');
  assert.equal(reportsUnsentAfterNetworkFailure(reports, 0).length, 3);
  assert.deepEqual(reportsUnsentAfterNetworkFailure(reports, 2), [reports[2]]);
  assert.notStrictEqual(remaining, reports, 'return new array without mutating source');
});

test('duplicate confirmation only stages reports after the challenged primary', () => {
  const remaining = reportsAwaitingDuplicateConfirmation(reports, 1);
  assert.deepEqual(remaining.map(x => x.client_request_id), ['request-3']);
  assert.strictEqual(remaining[0], reports[2]);
  assert.deepEqual(reportsAwaitingDuplicateConfirmation(reports, 0), [reports[1], reports[2]]);
  assert.deepEqual(reportsAwaitingDuplicateConfirmation(reports, 2), []);
  assert.deepEqual(reports.map(x => x.client_request_id), ['request-1', 'request-2', 'request-3']);
});

test('empty and already-completed suffixes remain empty and cannot duplicate output', () => {
  assert.deepEqual(reportsUnsentAfterNetworkFailure([], 0), []);
  assert.deepEqual(reportsAwaitingDuplicateConfirmation([], 0), []);
  assert.deepEqual(reportsUnsentAfterNetworkFailure(reports, 3), []);
});

test('worker submit wires the correct suffix to network failure and duplicate paths', () => {
  const source = fs.readFileSync(path.join(worker, 'ProcessPage.tsx'), 'utf8');
  assert.equal((source.match(/pendingSplitPayloadsRef\.current = reportsAwaitingDuplicateConfirmation\(payloads, index\)/g) || []).length, 2);
  assert.match(source, /queueRemainingMachineReports\(reportsUnsentAfterNetworkFailure\(payloads, index\)\)/);
  assert.match(source, /queueRemainingMachineReports\(payloads\);/);
  const cleanup = source.slice(source.indexOf('const finishDuplicateAction'), source.indexOf('const handleCreateDuplicateAnyway'));
  assert.equal((cleanup.match(/resetVersionRef\.current \+= 1/g) || []).length, 1, 'successful duplicate must invalidate autosave once');
  assert.match(cleanup, /clearProcessDraftAsync\(process\)/);
  assert.ok(cleanup.indexOf('clearProcessDraftAsync(process)') < cleanup.indexOf('navigate("/worker"'));
});

test('confirmed primary is never replayed in the duplicate resume branches', () => {
  const source = fs.readFileSync(path.join(worker, 'ProcessPage.tsx'), 'utf8');
  for (const [first, last] of [
    ['const handleCreateDuplicateAnyway = async () => {', 'const handleUpdateExistingReport = async () => {'],
    ['const handleUpdateExistingReport = async () => {', '// Separate-run duplicate creation'],
  ]) {
    const action = source.slice(source.indexOf(first), source.indexOf(last));
    assert.match(action, /if \(!duplicatePrimaryCompletedRef\.current\)/);
    assert.match(action, /duplicatePrimaryCompletedRef\.current = true/);
    assert.match(action, /if \(pendingCount\) queueRemainingMachineReports\(pendingSplitPayloadsRef\.current\)/);
    assert.ok(action.indexOf('queueRemainingMachineReports(pendingSplitPayloadsRef.current)') < action.indexOf('finishDuplicateAction()'));
  }
});
