const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'pages', 'worker', 'ProcessPage.tsx'), 'utf8');

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

test('KQD remains a normal NG defect and no product-specific exclusion policy is used', () => {
  const config = fs.readFileSync(path.join(__dirname, '..', 'src', 'pages', 'worker', 'processPageConfig.ts'), 'utf8');
  const formUtils = fs.readFileSync(path.join(__dirname, '..', 'src', 'pages', 'worker', 'processFormUtils.ts'), 'utf8');
  const submission = fs.readFileSync(path.join(__dirname, '..', 'src', 'pages', 'worker', 'processReportSubmission.ts'), 'utf8');
  assert.doesNotMatch(source, /useProductKqdPolicy|resolvedReportKqdPolicy|excludeKqdFromTt|productExcludesKqd/);
  assert.doesNotMatch(config, /KQD_CODES|kqdExclusionRegistry/);
  assert.match(formUtils, /sum \+ Number\(values\[item\.key\] \|\| 0\)/);
  assert.match(submission, /\["kqdDapLai", "KQD", "KQD"\]/);
  assert.match(submission, /\["kqdTuot", "KQD", "KQD"\]/);
  assert.doesNotMatch(submission, /exclude_kqd_from_tt|excludeKqdFromTt/);
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
