'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function harness(create) {
  const original = {};
  for (const key of ['localStorage', 'window', 'CustomEvent']) {
    original[key] = Object.getOwnPropertyDescriptor(globalThis, key);
  }
  const data = new Map();
  const storage = {
    getItem(key) { return data.get(key) ?? null; },
    setItem(key, value) { data.set(key, String(value)); },
    removeItem(key) { data.delete(key); }
  };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { dispatchEvent() {} } });
  Object.defineProperty(globalThis, 'CustomEvent', { configurable: true, value: class { constructor(type) { this.type = type; } } });
  const accounts = {
    A: { id: 100, worker_id: 1, worker_code: 'A', role: 'worker' },
    B: { id: 200, worker_id: 2, worker_code: 'B', role: 'worker' },
  };
  let active = 'A';
  const sent = [];
  const file = path.join(__dirname, '../src/services/offlineReportQueue.ts');
  const transpiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const mod = new Module(file, module);
  mod.filename = file;
  mod.paths = Module._nodeModulePaths(path.dirname(file));
  mod.require = (request) => {
    if (request === '../utils/authStorage') return { getStoredUser: () => accounts[active] || null };
    if (request === './productionService') return {
      createTempReport(payload) {
        sent.push({ payload, user: active });
        return create(payload, active);
      },
      checkSimilarTempReport: async () => ({ duplicate: false, data: null })
    };
    return Module.prototype.require.call(mod, request);
  };
  mod._compile(transpiled, file);
  let n = 0;
  return {
    queue: mod.exports,
    sent,
    setUser(next) { active = next; },
    pending() { return JSON.parse(data.get('ktcOfflineReportQueueV1') || '[]'); },
    payload() { return { client_request_id: 'req-' + (++n), process_id: 1, shift: 'A', work_date: '2026-10-30' }; },
    async tick() { await Promise.resolve(); await new Promise((resolve) => setImmediate(resolve)); },
    cleanup() {
      for (const [key, descriptor] of Object.entries(original)) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
    }
  };
}

test('adding a second offline report while the first awaits the backend does not lose the second', async () => {
  const first = deferred();
  const h = harness((payload) => payload.client_request_id === 'req-1' ? first.promise : Promise.resolve({ success: true }));
  try {
    h.queue.enqueueOfflineReport(h.payload());
    h.queue.enqueueOfflineReport(h.payload());
    assert.equal(h.pending().length, 2);
    assert.equal(h.sent.length, 1, 'the second flush must not overlap the first');
    first.resolve({ success: true });
    await h.queue.flushOfflineReportQueue();
    assert.deepEqual(h.pending().map((x) => x.payload.client_request_id), ['req-2']);
    await h.queue.flushOfflineReportQueue({ force: true });
    assert.equal(h.pending().length, 0);
    assert.deepEqual(h.sent.map((x) => x.payload.client_request_id), ['req-1', 'req-2']);
  } finally { h.cleanup(); }
});

test('switching worker during an in-flight request preserves A and sends only B next', async () => {
  const first = deferred();
  const second = deferred();
  const h = harness((payload) => payload.client_request_id === 'req-1' ? first.promise : second.promise);
  try {
    h.queue.enqueueOfflineReport(h.payload()); // A, request in-flight
    h.setUser('B');
    h.queue.enqueueOfflineReport(h.payload()); // B, scheduled after A completes
    assert.deepEqual(h.sent.map((x) => x.user), ['A']);
    first.resolve({ success: true });
    await h.tick();
    assert.deepEqual(h.sent.map((x) => x.user), ['A', 'B']);
    second.resolve({ success: true });
    await h.tick();
    assert.deepEqual(h.pending().map((x) => x.payload.client_request_id), ['req-1']);
    assert.equal(h.pending()[0].owner.workerCode, 'A');
  } finally { h.cleanup(); }
});

test('switching workers prevents further sends from the old owner after a delayed response', async () => {
  const first = deferred();
  const h = harness((payload) => payload.client_request_id === 'req-1' ? first.promise : Promise.resolve({ success: true }));
  try {
    h.queue.enqueueOfflineReport(h.payload());
    h.queue.enqueueOfflineReport(h.payload()); // A's second item remains queued
    h.setUser('B');
    first.resolve({ success: true });
    await h.tick();
    assert.deepEqual(h.sent.map((x) => x.payload.client_request_id), ['req-1']);
    assert.deepEqual(h.pending().map((x) => x.payload.client_request_id), ['req-1', 'req-2']);
    h.setUser('A');
    await h.queue.flushOfflineReportQueue({ force: true });
    assert.deepEqual(h.sent.map((x) => x.payload.client_request_id), ['req-1', 'req-1', 'req-2']);
    assert.equal(h.pending().length, 0);
  } finally { h.cleanup(); }
});

test('manually removed queued report is not resurrected when another request finishes', async () => {
  const first = deferred();
  const h = harness(() => first.promise);
  try {
    h.queue.enqueueOfflineReport(h.payload());
    const removed = h.queue.enqueueOfflineReport(h.payload());
    assert.equal(h.queue.removeOfflineReport(removed.id), true);
    first.resolve({ success: true });
    await h.queue.flushOfflineReportQueue();
    assert.equal(h.pending().length, 0);
  } finally { h.cleanup(); }
});
