'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Run the real TypeScript queue module with fake browser storage and an
// indefinitely pending API call. No network, credentials or test database.
function makeQueue({ failWrite = false, initialRaw = null } = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../src/services/offlineReportQueue.ts'), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const values = new Map();
  if (initialRaw !== null) values.set('ktcOfflineReportQueueV1', initialRaw);
  let writes = 0;
  let events = 0;
  let uuid = 0;
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem(key, value) {
      if (failWrite) throw new Error('QuotaExceededError');
      writes += 1;
      values.set(key, value);
    },
    removeItem(key) { values.delete(key); },
  };
  const module = { exports: {} };
  const axios = { isAxiosError: () => false, isCancel: () => false };
  vm.runInNewContext(compiled, {
    module,
    exports: module.exports,
    require(id) {
      if (id === 'axios') return { __esModule: true, default: axios };
      if (id === '../utils/authStorage') {
        return { getStoredUser: () => ({ id: 1, role: 'worker', worker_id: 2, worker_code: '49-001' }) };
      }
      if (id === './productionService') {
        return { createTempReport: () => new Promise(() => {}), checkSimilarTempReport: async () => ({}) };
      }
      throw new Error('Unexpected dependency: ' + id);
    },
    localStorage: storage,
    window: { dispatchEvent() { events += 1; } },
    CustomEvent: class CustomEvent {},
    crypto: { randomUUID() { uuid += 1; return 'uuid-' + uuid; } },
    Date,
    Promise,
    console,
  }, { filename: 'offlineReportQueue.js' });
  return {
    queue: module.exports,
    state: () => ({
      writes,
      events,
      raw: values.get('ktcOfflineReportQueueV1') || null,
      items: (() => { try { return JSON.parse(values.get('ktcOfflineReportQueueV1') || '[]'); } catch { return null; } })(),
    }),
  };
}

const payloads = (...ids) => ids.map((id) => ({ client_request_id: id, process_id: 1, work_date: '2026-11-10' }));

test('atomic split enqueue writes all reports once and deduplicates repeat ids', () => {
  const { queue, state } = makeQueue();
  const items = queue.enqueueOfflineReports(payloads('a', 'b', 'b', 'c'));
  assert.equal(items.length, 4);
  assert.equal(state().items.length, 3);
  assert.equal(state().writes, 1);
  assert.equal(state().events, 1);
  queue.enqueueOfflineReports(payloads('a', 'c'));
  assert.equal(state().items.length, 3);
  assert.equal(state().writes, 1);
});

test('invalid id rejects entire batch without changing persistent queue', () => {
  const { queue, state } = makeQueue();
  assert.throws(() => queue.enqueueOfflineReports(payloads('first', '')), /client_request_id/);
  assert.equal(state().items.length, 0);
  assert.equal(state().writes, 0);
});

test('capacity overflow rejects entire split remainder rather than partially saving it', () => {
  const { queue, state } = makeQueue();
  queue.enqueueOfflineReports(payloads(...Array.from({ length: 49 }, (_, i) => 'existing-' + i)));
  assert.equal(state().items.length, 49);
  const previousWrites = state().writes;
  assert.throws(() => queue.enqueueOfflineReports(payloads('new-1', 'new-2')), /không đủ chỗ/);
  assert.equal(state().items.length, 49);
  assert.equal(state().writes, previousWrites);
});

test('storage failure never reports a split batch as safely queued', () => {
  const { queue, state } = makeQueue({ failWrite: true });
  assert.throws(() => queue.enqueueOfflineReports(payloads('x', 'y')), /Không còn đủ bộ nhớ/);
  assert.equal(state().items.length, 0);
  assert.equal(state().events, 0);
});

test('corrupt JSON in the existing offline queue is never overwritten by a new batch', () => {
  const corrupt = '{"unfinished":';
  const { queue, state } = makeQueue({ initialRaw: corrupt });
  assert.throws(() => queue.enqueueOfflineReports(payloads('a', 'b')), /Không thể ghi đè/);
  assert.equal(state().raw, corrupt);
  assert.equal(state().writes, 0);
});

test('malformed existing queue records are preserved rather than silently discarded', () => {
  const corrupt = JSON.stringify([{ id: 'old', payload: null, owner: null }]);
  const { queue, state } = makeQueue({ initialRaw: corrupt });
  assert.throws(() => queue.enqueueOfflineReports(payloads('a')), /Không thể ghi đè/);
  assert.equal(state().raw, corrupt);
  assert.equal(state().writes, 0);
});
