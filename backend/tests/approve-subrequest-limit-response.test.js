'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

function loadController(approveImpl) {
  const original = Module._load;
  Module._load = function (request, parent, ...rest) {
    if (/config\/db$/.test(request)) return { promise: () => ({ query: async () => [[{ process_id: 1 }]] }), query() {}, getConnection() {} };
    if (/models\/productionTempModel$/.test(request)) return { approveSelected: approveImpl };
    if (/services\/permissionService$/.test(request)) return { hasPermission: async () => true };
    if (/services\/processAuthorizationService$/.test(request)) return { assertProcessesScope: async () => true, assertWorkerOwnership: async () => true };
    return original.call(this, request, parent, ...rest);
  };
  const file = path.join(__dirname, '..', 'controllers', 'productionTempManagementController.js');
  delete require.cache[file];
  try { return require(file); } finally { Module._load = original; }
}

async function call(controller) {
  let out = {};
  const res = { status(code) { out.status = code; return this; }, json(body) { out.body = body; return this; } };
  const origErr = console.error; console.error = () => {};
  try { await controller.approveSelectedReports({ body: { ids: [900001] }, user: { id: 9, role: 'manager' }, requestId: 'req-1' }, res); } finally { console.error = origErr; }
  return out;
}

test('subrequest-limit failure answers 503 WORKER_SUBREQUEST_LIMIT with the request id, not a generic 400', async () => {
  const err = Object.assign(new Error('TiDB query failed: Too many subrequests by single Worker invocation.'), { isSubrequestLimit: true });
  const out = await call(loadController(async () => { throw err; }));
  assert.equal(out.status, 503);
  assert.equal(out.body.code, 'WORKER_SUBREQUEST_LIMIT');
  assert.equal(out.body.requestId, 'req-1');
  assert.equal(out.body.success, false);
});

test('business errors keep their own status and code', async () => {
  const err = Object.assign(new Error('Máy cần event'), { status: 422, code: 'MACHINE_EVENT_REQUIRED', isPublic: true });
  const out = await call(loadController(async () => { throw err; }));
  assert.equal(out.status, 422);
  assert.equal(out.body.code, 'MACHINE_EVENT_REQUIRED');
});

test('unclassified database errors still use the existing 400 fallback', async () => {
  const out = await call(loadController(async () => { throw new Error('boom'); }));
  assert.equal(out.status, 400);
});
