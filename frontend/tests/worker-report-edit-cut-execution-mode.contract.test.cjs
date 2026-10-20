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

test('worker edit declares state and wires both values to ProcessBasicInfoSection', () => {
  assert.match(source, /const \[cutExecutionMode, setCutExecutionMode\] = useState<"AUTO" \| "NON_AUTO">\("AUTO"\)/);
  assert.match(source, /cutExecutionMode=\{cutExecutionMode\} setCutExecutionMode=\{setCutExecutionMode\}/);
  assert.match(basicInfo, /cutExecutionMode: CutExecutionMode; setCutExecutionMode: Dispatch<SetStateAction<CutExecutionMode>>/);
  assert.match(basicInfo, /cutExecutionMode, setCutExecutionMode, usesMultiMachineLines/);
});

test('machine-code mapping matches the component automatic-machine set', () => {
  const match = basicInfo.match(/GC_AUTOMATIC_MACHINE_CODES = new Set\(\[([^\]]+)\]\)/);
  assert.ok(match, 'component must declare its automatic-machine set');
  const componentCodes = [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort();

  const loadedMachineExpression = source.match(/const loadedMachineCode = s\(firstLine\?\.machine_code \|\| data\.machine_no\)[\s\S]{0,240}?setCutExecutionMode\(\[(.*?)\]\.includes\(loadedMachineCode\) \? "AUTO" : "NON_AUTO"\)/);
  assert.ok(loadedMachineExpression, 'worker edit must derive mode from the loaded primary machine');
  const editCodes = [...loadedMachineExpression[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort();
  assert.deepEqual(editCodes, componentCodes, 'edit-mode mapping must stay in sync with ProcessBasicInfoSection');
  assert.deepEqual(componentCodes, ['C11', 'C5', 'C6', 'C7']);
});

test('CUT mode filters machine options using the shared automatic-machine set', () => {
  const normalized = basicInfo.match(/const getMachineCode = \(option: AutocompleteOption\): string => ([^;]+);/);
  assert.ok(normalized, 'component must normalize machine option codes');
  assert.match(normalized[1], /trim\(\).*toUpperCase\(\).*replace\(/);
  assert.match(normalized[1], /MÁY/);

  const machineFilter = basicInfo.match(/const visibleGcMachineOptions = ([^;]+);/);
  assert.ok(machineFilter, 'component must filter CUT machine options based on execution mode');
  assert.match(machineFilter[1], /operationType === "CUT"/);
  assert.match(machineFilter[1], /cutExecutionMode === "AUTO"/);
  assert.match(machineFilter[1], /GC_AUTOMATIC_MACHINE_CODES\.has\(getMachineCode\(option\)\)/);
  assert.match(machineFilter[1], /!GC_AUTOMATIC_MACHINE_CODES\.has\(getMachineCode\(option\)\)/);
});

test('changing operation type resets execution mode to the expected default for CUT/LONG', () => {
  assert.match(basicInfo, /if \(nextType === "CUT"\) \{ setOperationMode\("MACHINE"\); setCutExecutionMode\("AUTO"\);/);
  assert.match(basicInfo, /setOperationMode\("MANUAL"\); setCutExecutionMode\("AUTO"\); setLongExecutionMode\("MANUAL"\)/);
});
