'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('P0 approval path keeps transaction + row-lock + optimistic concurrency', () => {
  const source = read('models/productionTempApprovalModel.js');
  assert.match(source, /await beginTransaction\(connection\)/);
  assert.match(source, /FOR UPDATE/);
  assert.match(source, /TEMP_REPORT_VERSION_CONFLICT/);
  assert.match(source, /await commit\(connection\)/);
  assert.match(source, /await rollback\(connection\)/);
});

test('P0 worker submission keeps idempotency and duplicate challenge controls', () => {
  const source = read('controllers/productionTempWorkerController.js');
  assert.match(source, /CLIENT_REQUEST_ID_REQUIRED/);
  assert.match(source, /DUPLICATE_CONFIRMATION_REQUIRED/);
  assert.match(source, /duplicate_confirmation_token/);
  assert.match(source, /client_request_id/);
});

test('P0 manager authorization is process-scoped before approval', () => {
  const source = read('models/productionTempApprovalModel.js');
  assert.match(source, /JOIN manager_processes mp ON mp\.process_id = temp\.process_id/);
  assert.match(source, /mp\.manager_id = \?/);
});

test('P0 zero-cost E2E covers the locked business flow', () => {
  const e2e = fs.readFileSync(path.join(root, '..', 'scripts/zero-cost/critical-e2e.cjs'), 'utf8');
  for (const marker of [
    'Worker login',
    'Duplicate detection',
    'Backdate -14',
    'Backdate -15',
    'MAI multi-machine',
    'GC 5/6/7/11 max4',
    'Shared-machine accounting',
    'manager_processes authorization',
    'Approve/reject',
    'Approved edit conflict',
    'Excel export data',
    'Excel import real-diff',
  ]) {
    assert.ok(e2e.includes(marker), `Critical E2E thiếu case: ${marker}`);
  }
});
