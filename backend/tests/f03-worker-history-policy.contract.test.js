'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('F03 temporarily disables the edit expiry in both backend guards, not authorization', () => {
  const policy = require('../utils/workerEditWindowPolicy');
  assert.equal(policy.WORKER_EDIT_TIME_LIMIT_ENABLED, false);
  assert.deepEqual([...policy.WORKER_EDITABLE_STATUSES], ['pending']);
  const middleware = read('backend/middleware/notifyWorkerOnTempEdit.js');
  const model = read('backend/models/productionTempUpdateModel.js');
  assert.match(middleware, /WORKER_EDIT_TIME_LIMIT_ENABLED/);
  assert.match(middleware, /if \(WORKER_EDIT_TIME_LIMIT_ENABLED\)/);
  assert.match(middleware, /report\.worker_user_id\) !== Number\(req\.user\?\.id\)/);
  assert.match(middleware, /!WORKER_EDITABLE_STATUSES\.includes\(status\)/);
  assert.match(model, /if \(WORKER_EDIT_TIME_LIMIT_ENABLED\)/);
  assert.match(model, /!WORKER_EDITABLE_STATUSES\.includes\(status\)/);
  assert.match(model, /scopeWhere = isAdmin \? "" : isWorkerEdit \? "AND pr\.worker_id = \?"/);
});

test('F03 writes still use row locking and reject old edit versions', () => {
  const model = read('backend/models/productionTempUpdateModel.js');
  assert.match(model, /FOR UPDATE/);
  assert.match(model, /options\.expectedUpdatedAt/);
  assert.match(model, /TEMP_REPORT_VERSION_CONFLICT/);
  assert.match(model, /!WORKER_EDITABLE_STATUSES\.includes\(status\)/);
});

test('F03 edit and create share the same machine line validation contract', () => {
  const edit = read('frontend/src/pages/worker/WorkerReportEditV2.tsx');
  const create = read('frontend/src/pages/worker/ProcessPage.tsx');
  assert.match(create, /validateMachineLines\(/);
  assert.match(edit, /validateMachineLines\(/);
  assert.match(edit, /buildProductionReportPayload\(/);
  assert.match(edit, /TEMP_REPORT_VERSION_CONFLICT/);
});
