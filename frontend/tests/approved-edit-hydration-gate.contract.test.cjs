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
  assert.match(hook, /setActiveDeductionOptions\(\[\s\S]*setMasterDetailsReady\(true\)/);
  assert.match(hook, /masterDetailsReady,/);
});
