const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../src/pages/worker/ProcessPage.tsx'), 'utf8');
function action(start, end) {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a);
  return source.slice(a, b);
}

test('confirmed duplicate create/update preserve the remaining split queue on transient errors', () => {
  for (const [start, end] of [
    ['const handleCreateDuplicateAnyway = async () => {', 'const handleUpdateExistingReport = async () => {'],
    ['const handleUpdateExistingReport = async () => {', '// Separate-run duplicate creation'],
  ]) {
    const handler = action(start, end);
    assert.match(handler, /duplicatePrimaryCompletedRef\.current && isTransientNetworkFailure\(error\)/);
    assert.match(handler, /error\.response\?\.status === 429/);
    assert.match(handler, /for \(const payload of pendingSplitPayloadsRef\.current\) enqueueOfflineReport\(payload\);/);
    assert.match(handler, /finishDuplicateAction\(\);\s*return;/);
    assert.match(handler, /catch \(queueError: unknown\)/);
    assert.match(handler, /while \(pendingSplitPayloadsRef\.current\.length\)/);
  }
});

test('never clear an incomplete split on failed offline queue persistence', () => {
  const create = action('const handleCreateDuplicateAnyway = async () => {', 'const handleUpdateExistingReport = async () => {');
  const queueFailure = create.slice(create.indexOf('catch (queueError: unknown)'));
  assert.doesNotMatch(queueFailure, /pendingSplitPayloadsRef\.current\s*=\s*\[\]/);
  assert.match(queueFailure, /submitLockRef\.current = false;/);
});

test('offline queue only accepts payloads with stable client request ids', () => {
  const queue = fs.readFileSync(path.join(__dirname, '../src/services/offlineReportQueue.ts'), 'utf8');
  assert.match(queue, /if \(!clientRequestId\) throw new Error/);
  assert.match(queue, /item\.payload\.client_request_id === clientRequestId/);
});

test('form reset cannot discard confirmed but unsent split reports', () => {
  const handler = action('const handleReset = () => {', 'return (');
  assert.match(handler, /if \(duplicatePrimaryCompletedRef\.current && pendingSplitPayloadsRef\.current\.length\)/);
  assert.ok(handler.indexOf('return;') < handler.indexOf('clearProcessDraft(process)'));
});
