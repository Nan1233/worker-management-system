const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'models', 'productionTempModel.js'),
  'utf8',
);

test('production temp create serializes submissions and retries TiDB lock wait timeouts', () => {
  assert.match(source, /submissionQueues\s*=\s*new Map/);
  assert.match(source, /runSerialized\(queueKey/);
  assert.match(source, /LOCK_RETRY_ATTEMPTS\s*=\s*3/);
  assert.match(source, /ER_LOCK_WAIT_TIMEOUT/);
  assert.match(source, /Number\(error\?\.errno\)\s*===\s*1205/);
  assert.match(source, /createModel\.createCompleteReport\(data, defects, deductions, machineLines, audit\)/);
  assert.match(source, /findExistingClientRequest\(data\)/);
  assert.match(source, /sleep\(LOCK_RETRY_DELAYS_MS\[attempt - 1\]/);
});
