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

test('KQD is counted normally by default and excluded only when product master policy says so', () => {
  const config = fs.readFileSync(path.join(__dirname, '..', 'src', 'pages', 'worker', 'processPageConfig.ts'), 'utf8');
  const formUtils = fs.readFileSync(path.join(__dirname, '..', 'src', 'pages', 'worker', 'processFormUtils.ts'), 'utf8');
  const submission = fs.readFileSync(path.join(__dirname, '..', 'src', 'pages', 'worker', 'processReportSubmission.ts'), 'utf8');

  assert.match(source, /resolvedReportKqdPolicy/);
  assert.match(source, /setResolvedReportKqdPolicy\(Number\(resolved\.exclude_kqd_from_tt/);
  assert.match(source, /excludeKqdFromTt: resolvedReportKqdPolicy === true/);
  assert.doesNotMatch(source, /Quy tắc KQD theo sản phẩm|name=["']exclude_kqd_from_tt["']/);
  assert.match(config, /kqdExclusionRegistry/);
  assert.match(formUtils, /if \(excludeKqd && kqdCodes\.has\(code\)\) return sum/);
  assert.match(formUtils, /return sum \+ Number\(values\[item\.key\] \|\| 0\)/);
  assert.match(submission, /\["kqdDapLai", "KQD", "KQD"\]/);
  assert.match(submission, /\["kqdTuot", "KQD", "KQD"\]/);
  assert.match(submission, /exclude_kqd_from_tt:args\.excludeKqdFromTt\?1:0/);
});
