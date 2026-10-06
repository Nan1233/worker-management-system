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
  assert.match(source, /recoverAfter1205/);
  // TiDB reports lock wait timeout by errno 1205; message text is not stable across drivers.
  assert.match(source, /Number\(error\?\.errno\)\s*===\s*1205/);
  assert.match(source, /createModel\.createCompleteReport\(data, defects, deductions, machineLines, audit\)/);
  assert.match(source, /findExistingClientRequest\(data\)/);
  assert.match(source, /for \(const delay of \[0, 150, 500, 1000\]\)/);
});
