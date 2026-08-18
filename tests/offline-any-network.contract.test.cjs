const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root,p),'utf8');

test('worker process does not gate on company network and queues offline', () => {
  const src = read('frontend/src/pages/worker/ProcessPage.tsx');
  assert.doesNotMatch(src, /getCompanyNetworkAccess|ProcessNetworkGate|networkAllowed|networkChecking/);
  assert.match(src, /if \(!navigator\.onLine\)/);
  assert.match(src, /enqueueOfflineReport\(payload\)/);
  assert.match(src, /tự gửi khi có Internet/);
});

test('worker and master data have persistent offline fallback', () => {
  const worker = read('frontend/src/services/workerService.ts');
  const master = read('frontend/src/services/masterDataCache.ts');
  assert.match(worker, /readOfflineSnapshot<WorkerProfile>/);
  assert.match(worker, /writeOfflineSnapshot/);
  assert.match(master, /getCachedDeductions/);
  assert.match(master, /withOfflineSnapshot/);
  assert.match(master, /getCachedProductStandards/);
});
