const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'models', 'nonProductWorkCreateModel.js'),
  'utf8',
);

test('CVK submissions lock the client request before idempotency lookup', () => {
  const lockRequest = source.indexOf('await createModel.lockClientRequestId(workerId, clientRequestId, connection)');
  const requestLookup = source.indexOf('await createModel.findByClientRequest(workerId, clientRequestId, connection)');
  assert.notEqual(lockRequest, -1, 'CVK must acquire the database idempotency lock');
  assert.ok(requestLookup > lockRequest, 'request lookup must happen after acquiring its lock');
});

test('CVK submissions lock their logical identity before checking existing reports', () => {
  const lockLogical = source.indexOf('await createModel.lockLogicalDuplicateKey(logicalDuplicateKey, connection)');
  const logicalLookup = source.indexOf('const existing = await findExisting({ workerId, workDate: data.work_date, shift: data.shift, workType }, connection)');
  assert.notEqual(lockLogical, -1, 'CVK must acquire the logical duplicate lock');
  assert.ok(logicalLookup > lockLogical, 'logical duplicate lookup must happen after acquiring its lock');
});

test('CVK uses the same lock order as standard worker submissions', () => {
  const lockRequest = source.indexOf('await createModel.lockClientRequestId(workerId, clientRequestId, connection)');
  const lockLogical = source.indexOf('await createModel.lockLogicalDuplicateKey(logicalDuplicateKey, connection)');
  assert.ok(lockLogical > lockRequest, 'lock order must be request ID, then logical duplicate key');
});
