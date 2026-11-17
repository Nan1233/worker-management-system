const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'pages', 'worker', 'ProcessPage.tsx'), 'utf8');
const machineLookup = fs.readFileSync(path.join(__dirname, '..', 'src', 'pages', 'worker', 'useMachineLineStandardLookup.ts'), 'utf8');
const workerProfile = fs.readFileSync(path.join(__dirname, '..', 'src', 'pages', 'worker', 'useProcessWorkerProfile.ts'), 'utf8');

test('machine standard resolver ignores stale async responses', () => {
  assert.match(source, /useMachineLineStandardLookup/);
  assert.match(machineLookup, /const requestSeq = \(requestSequences\.current\[index\] \|\| 0\) \+ 1/);
  assert.match(machineLookup, /const isCurrentRequest = \(\) => requestSequences\.current\[index\] === requestSeq/);
  assert.match(machineLookup, /if \(!isCurrentRequest\(\)\) return;[\s\S]*resolved_output_per_hour/);
});

test('worker and master-data loads are fenced when process changes', () => {
  assert.match(source, /useProcessWorkerProfile/);
  assert.match(workerProfile, /requestSequence\.current === sequence/);
  assert.match(workerProfile, /requestSequence\.current \+= 1/);
  assert.match(source, /masterDataRequestSeqRef/);
  assert.match(source, /\[processInfo\.id, processCode, showToast\]/);
});

test('KQD is always counted as ordinary NG; no product-level exclusion policy remains', () => {
  const config = fs.readFileSync(path.join(__dirname, '..', 'src', 'pages', 'worker', 'processPageConfig.ts'), 'utf8');
  const formUtils = fs.readFileSync(path.join(__dirname, '..', 'src', 'pages', 'worker', 'processFormUtils.ts'), 'utf8');
  const submission = fs.readFileSync(path.join(__dirname, '..', 'src', 'pages', 'worker', 'processReportSubmission.ts'), 'utf8');

  assert.doesNotMatch(source, /resolvedReportKqdPolicy|exclude_kqd_from_tt|excludeKqdFromTt|KQD_CODES/);
  assert.doesNotMatch(config, /kqdExclusionRegistry|KQD_CODES/);
  assert.doesNotMatch(formUtils, /excludeKqd|kqdCodes/);
  assert.match(formUtils, /reduce\(\(sum, item\) => sum \+ Number\(values\[item\.key\] \|\| 0\), 0\)/);
  assert.match(submission, /\["kqdDapLai", "KQD", "KQD"\]/);
  assert.match(submission, /\["kqdTuot", "KQD", "KQD"\]/);
  assert.doesNotMatch(submission, /exclude_kqd_from_tt|excludeKqdFromTt/);
});
