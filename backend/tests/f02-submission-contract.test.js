'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('F02 worker create route requires authentication, worker role and WORKER_ENTRY', () => {
  const routes = read('backend/routes/productionTempRoutes.js');
  assert.match(routes, /router\.post\("\/", authMiddleware, workerReportLimiter, checkRole\("worker"\), permission\("WORKER_ENTRY"\)/);
});

test('F02 submission requires an idempotency request ID before writing data', () => {
  const controller = read('backend/controllers/productionTempWorkerController.js');
  assert.match(controller, /CLIENT_REQUEST_ID_REQUIRED/);
  assert.match(controller, /clientRequestId\.length > 64/);
  assert.match(controller, /validateProductionReport\(/);
  assert.match(controller, /validateMasterData\(/);
});

test('F02 frontend recovers only unsent split requests after connection loss', () => {
  const page = read('frontend/src/pages/worker/ProcessPage.tsx');
  const submitStart = page.indexOf('const handleSubmit =');
  const submitEnd = page.indexOf('const handleReset =', submitStart);
  assert.ok(submitStart >= 0 && submitEnd > submitStart);
  const submit = page.slice(submitStart, submitEnd);
  assert.match(submit, /for \(let index = 0; index < payloads\.length; index \+= 1\)/);
  assert.match(submit, /enqueueOfflineReports\(payloads\.slice\(index\)\)/);
  assert.match(submit, /if \(isTransientNetworkFailure\(error\)\)/);
  assert.match(submit, /clientRequestIdRef\.current \|\|= createClientRequestId\(\)/);
});

test('F02 queue persists and verifies a complete batch before confirming local save', () => {
  const queue = read('frontend/src/services/offlineReportQueue.ts');
  assert.match(queue, /if \(localStorage\.getItem\(STORAGE_KEY\) !== expected\)/);
  assert.match(queue, /assertSameQueuedSubmission\(/);
  assert.match(queue, /if \(newlyQueued\.length\) writeAll\(\[\.\.\.all, \.\.\.newlyQueued\]\)/);
});

test('daily cross-report hour enforcement stays disabled by user decision', () => {
  const limits = read('backend/utils/dailyHoursLimit.js');
  assert.match(limits, /DAILY_HOURS_ENFORCEMENT_ENABLED\s*=\s*false/);
});
