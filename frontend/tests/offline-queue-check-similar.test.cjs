const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('typescript');
const Module = require('node:module');
const { AxiosError } = require('axios');

// Transpile the real offlineReportQueue.ts and load it with stubbed service/auth modules (no network, no DB).
async function loadQueue(state) {
  const file = path.join(__dirname, '../src/services/offlineReportQueue.ts');
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const stubs = {
    './productionService': { createTempReport: (p) => state.create(p), checkSimilarTempReport: (p) => state.check(p) },
    '../utils/authStorage': { getStoredUser: () => ({ id: 1, role: 'worker', worker_id: 7, worker_code: 'w7' }) }
  };
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
  globalThis.window = { dispatchEvent() {} };
  globalThis.CustomEvent = class { constructor(t) { this.type = t; } };
  const mod = new Module(file, module);
  mod.filename = file;
  mod.paths = Module._nodeModulePaths(path.dirname(file));
  mod.require = (id) => (id in stubs ? stubs[id] : Module.prototype.require.call(mod, id));
  mod._compile(js, file);
  return { mod: mod.exports, store };
}

const httpError = (status, data = {}) => new AxiosError('x', 'ERR_BAD_REQUEST', undefined, {}, { status, data, statusText: '', headers: {}, config: {} });
const networkError = () => new AxiosError('Network Error', 'ERR_NETWORK');
const payload = { client_request_id: 'c1', process_id: 1, work_date: '2026-10-21', shift: 'A', machine_no: 'C13', product_name: 'C7236', operation_mode: 'MACHINE', work_type: 'Cắt' };
const items = (store) => JSON.parse(store.get('ktcOfflineReportQueueV1') || '[]');

test('422 create + check-similar business failure: item is blocked with the ORIGINAL create error and code, not "exists"/sent', async () => {
  const calls = { check: 0 };
  const { mod, store } = await loadQueue({
    create: async () => { throw httpError(422, { message: 'Dữ liệu không khớp danh mục hệ thống', code: 'STANDARD_WORK_TYPE_MISMATCH' }); },
    check: async (p) => { calls.check += 1; calls.sent = p; throw httpError(422, { message: 'Không thể kiểm tra báo cáo trùng', code: 'HISTORICAL_STANDARD_NOT_FOUND' }); }
  });
  mod.enqueueOfflineReport(payload);
  const res = await mod.flushOfflineReportQueue({ force: true });
  assert.equal(res.sent, 0);
  const [it] = items(store);
  assert.equal(it.status, 'blocked');
  assert.equal(it.lastError, 'Dữ liệu không khớp danh mục hệ thống');
  assert.equal(it.lastErrorCode, 'STANDARD_WORK_TYPE_MISMATCH');
  assert.equal(it.similarCheck, 'failed-business');
  assert.doesNotMatch(it.lastError, /trùng|duplicate/i, 'must not match the auto-requeue pattern');
  assert.equal(calls.sent.operation_mode, 'MACHINE');
  assert.equal(calls.sent.work_type, 'Cắt');
  assert.equal(JSON.stringify(it).includes('Bearer'), false);
});

test('blocked business errors are not retried automatically (no endless loop)', async () => {
  let creates = 0;
  const { mod, store } = await loadQueue({
    create: async () => { creates += 1; throw httpError(422, { message: 'Dữ liệu không khớp danh mục hệ thống', code: 'X_ERR' }); },
    check: async () => ({ duplicate: false, data: null })
  });
  mod.enqueueOfflineReport(payload);
  await mod.flushOfflineReportQueue({ force: true }); // first delivery attempt
  await mod.flushOfflineReportQueue(); // automatic flushes must not resend a blocked business error
  await mod.flushOfflineReportQueue();
  assert.equal(creates, 1);
  assert.equal(items(store)[0].status, 'blocked');
});

test('check-similar says "absent": item stays blocked with the original error (not treated as sent)', async () => {
  const { mod, store } = await loadQueue({
    create: async () => { throw httpError(422, { message: 'Dữ liệu không khớp danh mục hệ thống' }); },
    check: async () => ({ success: true, duplicate: false, data: null })
  });
  mod.enqueueOfflineReport(payload);
  const res = await mod.flushOfflineReportQueue({ force: true });
  assert.equal(res.sent, 0);
  assert.equal(items(store)[0].status, 'blocked');
});

test('check-similar confirms the report already exists: item is removed as sent', async () => {
  const { mod, store } = await loadQueue({
    create: async () => { throw httpError(422, { message: 'x' }); },
    check: async () => ({ success: true, duplicate: true, data: { id: 5 } })
  });
  mod.enqueueOfflineReport(payload);
  const res = await mod.flushOfflineReportQueue({ force: true });
  assert.equal(res.sent, 1);
  assert.equal(items(store).length, 0);
});

test('check-similar network/5xx failure after a 422 is unknown: retry later with backoff, original error kept, never "sent"', async () => {
  for (const failure of [networkError(), httpError(503, {})]) {
    const { mod, store } = await loadQueue({
      create: async () => { throw httpError(422, { message: 'Dữ liệu không khớp danh mục hệ thống', code: 'A_B' }); },
      check: async () => { throw failure; }
    });
    mod.enqueueOfflineReport(payload);
    const res = await mod.flushOfflineReportQueue({ force: true });
    assert.equal(res.sent, 0);
    const [it] = items(store);
    assert.equal(it.status, 'retrying');
    assert.ok(it.nextRetryAt > Date.now());
    assert.equal(it.lastError, 'Dữ liệu không khớp danh mục hệ thống');
    assert.equal(it.similarCheck, 'failed-transient');
  }
});

test('network and 5xx on create keep the existing retry policy; 4xx other than 422 is blocked', async () => {
  for (const [failure, expected] of [[networkError(), 'retrying'], [httpError(500, {}), 'retrying'], [httpError(400, { message: 'bad' }), 'blocked']]) {
    const { mod, store } = await loadQueue({ create: async () => { throw failure; }, check: async () => { throw new Error('check must not run'); } });
    mod.enqueueOfflineReport(payload);
    await mod.flushOfflineReportQueue({ force: true });
    assert.equal(items(store)[0].status, expected);
  }
});
