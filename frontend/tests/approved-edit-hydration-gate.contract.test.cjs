'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..', 'src', 'pages', 'worker');

test('approved edit waits until defect/deduction master lists are available', () => {
  const page = fs.readFileSync(path.join(root, 'useWorkerReportEdit.ts'), 'utf8') + '\n' + fs.readFileSync(path.join(root, 'WorkerReportEditV2.tsx'), 'utf8');
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

test('TT OK supports native input and React change without reading delayed DOM events', () => {
  const page = fs.readFileSync(path.join(root, 'useWorkerReportEdit.ts'), 'utf8') + '\n' + fs.readFileSync(path.join(root, 'WorkerReportEditV2.tsx'), 'utf8');
  const quality = fs.readFileSync(path.join(root, 'components/ProcessQualitySection.tsx'), 'utf8');
  assert.match(page, /const applyTtOkInput = \(raw: string\)/);
  assert.match(page, /const typedOk = raw\.replace\(/);
  assert.match(page, /const typedOk = event\.currentTarget\.value/);
  assert.match(page, /onTtOkInput=\{applyTtOkInput\}/);
  assert.match(quality, /onInput=\{!qualityLocked && onTtOkInput/);
  assert.match(quality, /onChange=\{qualityLocked \? undefined : onTtOkChange\}/);
});
test('hydration does not dispatch other state from inside a form state updater', () => {
  const page = fs.readFileSync(path.join(root, 'useWorkerReportEdit.ts'), 'utf8') + '\n' + fs.readFileSync(path.join(root, 'WorkerReportEditV2.tsx'), 'utf8');
  assert.match(page, /setSelectedNg\(hydratedNg\.map/);
  assert.match(page, /setSelectedDeduction\(hydratedDeductions\.map/);
  const ngHydration = page.slice(page.indexOf('setSelectedNg(hydratedNg.map'), page.indexOf('setMachineLines(', page.indexOf('setSelectedNg(hydratedNg.map')));
  const dedHydration = page.slice(page.indexOf('setSelectedDeduction(hydratedDeductions.map'), page.indexOf('setFormReady(true)', page.indexOf('setSelectedDeduction(hydratedDeductions.map')));
  assert.doesNotMatch(ngHydration, /setSelectedNg\(selected\)/);
  assert.doesNotMatch(dedHydration, /setSelectedDeduction\(selected\)/);
});
