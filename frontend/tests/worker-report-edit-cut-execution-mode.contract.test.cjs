'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '../src/pages/worker/WorkerReportEditV2.tsx'),
  'utf8',
);
const basicInfo = fs.readFileSync(
  path.join(__dirname, '../src/pages/worker/components/ProcessBasicInfoSection.tsx'),
  'utf8',
);
const executionMode = fs.readFileSync(
  path.join(__dirname, '../src/pages/worker/cutExecutionMode.js'),
  'utf8',
);

test('worker edit declares state and wires both values to ProcessBasicInfoSection', () => {
  assert.match(source, /const \[cutExecutionMode, setCutExecutionMode\] = useState<"AUTO" \| "NON_AUTO">\("AUTO"\)/);
  assert.match(source, /cutExecutionMode=\{cutExecutionMode\} setCutExecutionMode=\{setCutExecutionMode\}/);
  assert.match(basicInfo, /cutExecutionMode: CutExecutionMode; setCutExecutionMode: Dispatch<SetStateAction<CutExecutionMode>>/);
  assert.match(basicInfo, /cutExecutionMode, setCutExecutionMode, usesMultiMachineLines/);
});

test('machine-code mapping matches the shared execution-mode module', () => {
  const match = executionMode.match(/GC_AUTOMATIC_MACHINE_CODES = new Set\(\[([^\]]+)\]\)/);
  assert.ok(match, 'shared module must declare its automatic-machine set');
  const componentCodes = [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort();
  assert.match(source, /resolveCutExecutionMode\(loadedMachineCode\)/, 'edit page must use the executable mapping');
  assert.deepEqual(componentCodes, ['C11', 'C5', 'C6', 'C7']);
});

test('component delegates CUT option visibility to the shared execution-mode helper', () => {
  assert.match(basicInfo, /getVisibleGcMachineOptions\(machineAutocompleteOptions, operationType, cutExecutionMode\)/);
  assert.match(executionMode, /GC_AUTOMATIC_MACHINE_CODES\.has\(normalizeMachineCode\(option\.value\)\) === automatic/);
});

test('changing operation type resets execution mode to the expected default for CUT/LONG', () => {
  assert.match(basicInfo, /if \(nextType === "CUT"\) \{ setOperationMode\("MACHINE"\); setCutExecutionMode\("AUTO"\);/);
  assert.match(basicInfo, /setOperationMode\("MANUAL"\); setCutExecutionMode\("AUTO"\); setLongExecutionMode\("MANUAL"\)/);
});

test('machine code behavior maps C5/C6/C7/C11 to AUTO and other codes to NON_AUTO', async () => {
  const { resolveCutExecutionMode, normalizeMachineCode } = await import('../src/pages/worker/cutExecutionMode.js');
  for (const code of ['C5', 'C6', 'C7', 'C11', ' c5 ', 'Máy C6']) {
    assert.equal(resolveCutExecutionMode(code), 'AUTO', `${code} should be automatic`);
  }
  for (const code of ['C1', 'C4', 'C8', 'M1', '', null]) {
    assert.equal(resolveCutExecutionMode(code), 'NON_AUTO', `${code} should be non-automatic`);
  }
  assert.equal(normalizeMachineCode('  Máy c11 '), 'C11');
});

test('machine visibility behavior filters AUTO/NON_AUTO in CUT and preserves LONG options', async () => {
  const { getVisibleGcMachineOptions } = await import('../src/pages/worker/cutExecutionMode.js');
  const options = ['C5', 'C6', 'C7', 'C11', 'C4', 'M1'].map((value) => ({ value, label: value }));
  assert.deepEqual(
    getVisibleGcMachineOptions(options, 'CUT', 'AUTO').map((option) => option.value),
    ['C5', 'C6', 'C7', 'C11'],
  );
  assert.deepEqual(
    getVisibleGcMachineOptions(options, 'CUT', 'NON_AUTO').map((option) => option.value),
    ['C4', 'M1'],
  );
  assert.strictEqual(getVisibleGcMachineOptions(options, 'LONG', 'AUTO'), options);
});
