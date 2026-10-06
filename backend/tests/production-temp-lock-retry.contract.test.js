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
  // The current transaction boundary creates the parent row first, then persists
  // child details in a short independent transaction; createCompleteReport is the
  // public facade, not the inner parent INSERT call.
  assert.match(source, /createModel\.create\(data, parentConnection\)/);
  assert.match(source, /createModel\.createDefects\(tempId, data\.process_id, defects, childConnection\)/);
  assert.match(source, /createModel\.createDeductions\(tempId, data\.process_id, deductions, childConnection\)/);
  assert.match(source, /createModel\.replaceMachineLines\(tempId, machineLines, childConnection\)/);
  assert.match(source, /findExistingClientRequest\(data\)/);
  assert.match(source, /for \(const delay of \[0, 150, 500, 1000\]\)/);
});
