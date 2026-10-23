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
  // Parent and detail writes must share one transaction so a child failure
  // cannot leave a partial parent that a same-request retry mistakes for success.
  assert.match(source, /createModel\.create\(data, parentConnection\)/);
  assert.match(source, /createModel\.createDefects\(tempId, data\.process_id, defects, parentConnection\)/);
  assert.match(source, /createModel\.createDeductions\(tempId, data\.process_id, deductions, parentConnection\)/);
  assert.match(source, /createModel\.replaceMachineLines\(tempId, machineLines, parentConnection\)/);
  assert.doesNotMatch(source, /UPDATE production_reports_temp SET status='need_fix'/);
  assert.match(source, /findExistingClientRequest\(data\)/);
  assert.match(source, /for \(const delay of \[0, 150, 500, 1000\]\)/);
});
