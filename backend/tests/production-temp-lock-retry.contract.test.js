const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const serviceSource = fs.readFileSync(
  path.join(__dirname, '..', 'services', 'productionTempSubmissionService.js'),
  'utf8',
);
const createSource = fs.readFileSync(
  path.join(__dirname, '..', 'models', 'productionTempCreateModel.js'),
  'utf8',
);

test('production temp create serializes submissions and retries TiDB lock wait timeouts', () => {
  assert.match(serviceSource, /submissionQueues\s*=\s*new Map/);
  assert.match(serviceSource, /runSerialized\(queueKey/);
  assert.match(serviceSource, /recoverAfter1205/);
  // TiDB reports lock wait timeout by errno 1205; message text is not stable across drivers.
  assert.match(serviceSource, /Number\(error\?\.errno\)\s*===\s*1205/);
  // Parent and detail writes must share one transaction so a child failure
  // cannot leave a partial parent that a same-request retry mistakes for success.
  assert.match(serviceSource, /createModel\.create\(data, parentConnection\)/);
  assert.match(serviceSource, /createModel\.createDefects\(tempId, data\.process_id, defects, parentConnection\)/);
  assert.match(serviceSource, /createModel\.createDeductions\(tempId, data\.process_id, deductions, parentConnection\)/);
  assert.match(serviceSource, /createModel\.replaceMachineLines\(tempId, machineLines, parentConnection\)/);
  assert.doesNotMatch(serviceSource, /UPDATE production_reports_temp SET status='need_fix'/);
  assert.match(serviceSource, /findExistingClientRequest\(data\)/);
  assert.match(serviceSource, /for \(const delay of \[0, 150, 500, 1000\]\)/);
  assert.match(createSource, /client_request_id, logical_duplicate_key, status/);
});
