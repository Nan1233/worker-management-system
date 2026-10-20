'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '../src/pages/worker/WorkerReportEditV2.tsx'),
  'utf8',
);

test('worker report edit supplies cut execution mode required by ProcessBasicInfoSection', () => {
  assert.match(source, /const \[cutExecutionMode, setCutExecutionMode\] = useState<"AUTO" \| "NON_AUTO">\("AUTO"\)/);
  assert.match(source, /cutExecutionMode=\{cutExecutionMode\} setCutExecutionMode=\{setCutExecutionMode\}/);
});

test('editing an existing GC report preserves its automatic versus non-automatic machine mode', () => {
  assert.match(source, /const loadedMachineCode = s\(firstLine\?\.machine_code \|\| data\.machine_no\)/);
  assert.match(source, /\["C5", "C6", "C7", "C11"\]\.includes\(loadedMachineCode\) \? "AUTO" : "NON_AUTO"/);
});
