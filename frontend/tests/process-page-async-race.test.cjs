const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'pages', 'worker', 'ProcessPage.tsx'), 'utf8');
const kqdPolicyHook = fs.readFileSync(path.join(__dirname, '..', 'src', 'pages', 'worker', 'useProductKqdPolicy.ts'), 'utf8');

test('machine standard resolver ignores stale async responses', () => {
  assert.match(source, /machineStandardRequestSeqRef/);
  assert.match(source, /const isCurrentRequest = \(\) => machineStandardRequestSeqRef\.current\[index\] === requestSeq/);
  assert.match(source, /if \(!isCurrentRequest\(\)\) return;[\s\S]*resolved_output_per_hour/);
});

test('worker and master-data loads are fenced when process changes', () => {
  assert.match(source, /workerInfoRequestSeqRef/);
  assert.match(source, /masterDataRequestSeqRef/);
  assert.match(source, /\[processInfo\.id, processCode, showToast\]/);
});

test('product KQD policy is resolved by a dedicated hook with stale-response protection', () => {
  assert.match(source, /useProductKqdPolicy\(/);
  assert.doesNotMatch(source, /setResolvedReportKqdPolicy|resolvedOutput = Number\(resolved\.resolved_output_per_hour/);
  assert.match(kqdPolicyHook, /resolveProductStandard\(/);
  assert.match(kqdPolicyHook, /if \(!active\) return/);
  assert.match(kqdPolicyHook, /return \(\) => \{\s*active = false;/);
  assert.match(kqdPolicyHook, /Number\(resolved\.exclude_kqd_from_tt \|\| 0\) === 1/);
  assert.match(kqdPolicyHook, /standardOutput: String\(resolvedOutput\)/);
  assert.match(kqdPolicyHook, /\[processId, machineNo, productName, workDate, setForm\]/);
});

test('KQD policy keeps its tri-state result for report signature and payload decisions', () => {
  assert.match(kqdPolicyHook, /useState<boolean \| null>\(null\)/);
  assert.match(source, /resolvedReportKqdPolicy === true/);
  assert.match(source, /excludeKqdFromTt: resolvedReportKqdPolicy === true/);
  assert.match(source, /resolvedReportKqdPolicy,/);
});

test('machine-line state and editing actions are encapsulated without changing limits', () => {
  const machineLinesHook = fs.readFileSync(path.join(__dirname, '..', 'src', 'pages', 'worker', 'useProcessMachineLines.ts'), 'utf8');
  assert.match(source, /useProcessMachineLines\(\{ processCode, machineOptions \}\)/);
  assert.doesNotMatch(source, /const \[machineLines, setMachineLines\] = useState/);
  assert.doesNotMatch(source, /const resizeMachineLines = \(count: number\)/);
  assert.match(machineLinesHook, /getMaxMachineCount\(\s*processCode,\s*machineLines,\s*machineOptions/);
  assert.match(machineLinesHook, /Math\.min\(maxMachineCount, Math\.max\(1, count\)\)/);
  assert.match(machineLinesHook, /setMachineLines\(\(current\) => current\.slice\(0, maxMachineCount\)\)/);
  assert.match(machineLinesHook, /toggleMachineDefectLine\(line, key\)/);
  assert.match(machineLinesHook, /updateMachineDefectLine\(line, key, value\)/);
});
