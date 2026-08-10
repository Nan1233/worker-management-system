const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('new temp report commits report, details, machine lines and semantic audit in one transaction', () => {
  const source = read('models/productionTempCreateModel.js');

  const txStart = source.indexOf('await beginTransaction(connection)');
  const create = source.indexOf('const tempId = await this.create(data, connection)', txStart);
  const defects = source.indexOf('await this.createDefects(tempId, data.process_id, defects, connection)', create);
  const deductions = source.indexOf('await this.createDeductions(tempId, data.process_id, deductions, connection)', defects);
  const machines = source.indexOf('await this.replaceMachineLines(tempId, machineLines, connection)', deductions);
  const actionLog = source.indexOf('await this.logAction({', machines);
  const activityLog = source.indexOf('INSERT INTO activity_logs', actionLog);
  const commit = source.indexOf('await commit(connection)', activityLog);
  const rollback = source.indexOf('await rollback(connection)', commit);

  assert.ok(txStart >= 0, 'create flow must start a DB transaction');
  assert.ok(create > txStart, 'base report must be written inside transaction');
  assert.ok(defects > create, 'defects must be written inside transaction');
  assert.ok(deductions > defects, 'deductions must be written inside transaction');
  assert.ok(machines > deductions, 'machine lines must be written inside transaction');
  assert.ok(actionLog > machines, 'report action audit must happen before commit');
  assert.ok(activityLog > actionLog, 'semantic activity audit must happen before commit');
  assert.ok(commit > activityLog, 'commit must happen only after all report/audit writes');
  assert.ok(rollback > commit, 'transaction failure path must rollback');
});

test('new report requires an authenticated audit actor and API requires client_request_id', () => {
  const model = read('models/productionTempCreateModel.js');
  const controller = read('controllers/productionTempWorkerController.js');
  const migration = read('migrations/008_client_request_idempotency.sql');

  assert.match(model, /REPORT_AUDIT_ACTOR_REQUIRED/);
  assert.match(controller, /CLIENT_REQUEST_ID_REQUIRED/);
  assert.match(controller, /client_request_id:\s*clientRequestId/);
  assert.match(migration, /CREATE UNIQUE INDEX uq_prt_worker_client_request[\s\S]*worker_id, client_request_id/);
});

test('post-create background work is notification-only and cannot duplicate semantic create audit', () => {
  const sideEffects = read('services/productionReportSideEffectsService.js');
  const frontend = read('../frontend/src/pages/worker/ProcessPage.tsx');

  assert.doesNotMatch(sideEffects, /ProductionTemp\.logAction/);
  assert.doesNotMatch(sideEffects, /AuditService\.logActivity/);
  assert.match(sideEffects, /AuditService\.notifyUsers/);

  // A network retry must reuse the same client-side request ID until success.
  assert.match(frontend, /clientRequestIdRef\.current \|\|= crypto\.randomUUID\(\)/);
  assert.match(frontend, /client_request_id:\s*clientRequestIdRef\.current/);
  assert.match(frontend, /clientRequestIdRef\.current = null/);
});
