'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..', 'src', 'pages', 'worker');

test('approved edit waits until defect/deduction master lists are available', () => {
  const page = fs.readFileSync(path.join(root, 'WorkerReportEditV2.tsx'), 'utf8');
  assert.match(page, /!masterDetailsReady \|\| hydratedReportRef\.current === report/);
  assert.match(page, /!formReady/);
  assert.match(page, /report \? getCanonicalProcessId\([\s\S]*?\) : 0/);
  assert.doesNotMatch(page, /setReport\(data\);/);
  assert.match(page, /setReport\(\{ \.\.\.data, __edit_machine_lines: editMachineLines \}\)/);
});

test('master data has independent basic and complete detail readiness gates', () => {
  const hook = fs.readFileSync(path.join(root, 'useProcessMasterData.ts'), 'utf8');
  assert.match(hook, /setLoading\(false\);[\s\S]*const optionalResults = await Promise\.allSettled/);
  assert.match(hook, /setMasterDetailsReady\(false\)/);
  const optionsBegin = hook.indexOf('const optionalResults = await Promise.allSettled');
  const deductionCommit = hook.indexOf('setActiveDeductionOptions([', optionsBegin);
  const detailsReady = hook.indexOf('setMasterDetailsReady(true);', optionsBegin);
  assert.ok(optionsBegin >= 0 && deductionCommit > optionsBegin && detailsReady > deductionCommit,
    'detail readiness must follow the asynchronous NG/deduction lists');
  assert.match(hook, /masterDetailsReady,/);
});

test('TT OK input captures user text synchronously before React queues a state update', () => {
  const page = fs.readFileSync(path.join(root, 'WorkerReportEditV2.tsx'), 'utf8');
  const start = page.indexOf('const onTtOkChange = ');
  const end = page.indexOf('const onNumberBlur', start);
  assert.ok(start > 0 && end > start);
  const handler = page.slice(start, end);
  const capture = handler.indexOf('const typedOk = event.currentTarget.value');
  const update = handler.indexOf('setForm((current) =>');
  assert.ok(capture >= 0 && update > capture, 'capture currentTarget.value before the updater');
  assert.match(handler, /ttOk: typedOk/);
  assert.doesNotMatch(handler.slice(update), /event\.(target|currentTarget)\.value/,
    'never access a mutable DOM event inside an asynchronous updater');
});
