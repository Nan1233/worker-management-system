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
  const controller = read('controllers/productionTempWorkerController.js');
  const createModel = read('models/productionTempCreateModel.js');
  assert.match(controller, /CLIENT_REQUEST_ID_REQUIRED/);
  assert.match(controller, /DUPLICATE_CONFIRMATION_REQUIRED/);
  assert.match(controller, /duplicate_confirmation_token/);
  assert.match(controller, /client_request_id/);
  assert.match(createModel, /lockClientRequestId/);
  assert.match(createModel, /findByClientRequest/);
  assert.match(createModel, /verifyDuplicateConfirmation/);
  assert.match(createModel, /duplicate_reason: "request_id"/);
});

test('P0 manager authorization is process-scoped before approval', () => {
  const source = read('models/productionTempApprovalModel.js');
  assert.match(source, /JOIN manager_processes mp ON mp\.process_id = temp\.process_id/);
  assert.match(source, /mp\.manager_id = \?/);
});

test('P0 runtime schema verifier uses a minimum structural contract and keeps full drift diagnostics non-blocking', () => {
  const source = read('services/databaseSchemaService.js');
  const verifier = read('scripts/verifyDatabaseSchema.js');
  assert.match(source, /RUNTIME_REQUIRED_COLUMNS/);
  assert.match(source, /MINIMUM_STRUCTURAL_V1/);
  assert.match(source, /extraTables/);
  assert.match(source, /extraColumns/);
  assert.match(source, /extraIndexes/);
  assert.match(source, /const ready =/);
  assert.match(verifier, /Database runtime contract READY/);
});


test('P0 shared-machine accounting keeps GC 5/6/7/11 at four workers and preserves physical event links', () => {
  const factory = read('services/factoryMachineRuleService.js');
  const createModel = read('models/productionTempCreateModel.js');
  assert.match(factory, /GC_SHARED_MACHINE_NUMBERS/);
  assert.match(factory, /DEFAULT_SHARED_WORKERS_PER_MACHINE = 4/);
  assert.match(createModel, /const requestedEventId = line\.machine_event_id \|\| null/);
  assert.match(createModel, /const normalizedRequestedEventId = Number\(requestedEventId\)/);
});

test('P0 business validator enforces 14-day backdate and 12-hour total-time limit', () => {
  const source = read('utils/reportValidation.js');
  assert.match(source, /MAX_TOTAL_TIME_HOURS = 12/);
  assert.match(source, /maxBackDays \?\? 14/);
  assert.match(source, /parsedDate < oldest/);
  assert.match(source, /totalTime > MAX_TOTAL_TIME_HOURS/);
  assert.match(source, /totalTime - \(actualTime \+ deductionTime\)/);
});

test('P0 business validator rejects future work dates', () => {
  const source = read('utils/reportValidation.js');
  assert.match(source, /parsedDate > today/);
  assert.match(source, /Không được nhập báo cáo cho ngày tương lai/);
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
