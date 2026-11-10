'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const file = path.join(__dirname, '../src/services/reliableReportJournal.ts');
const accountA = { id: 101, role: 'worker', worker_id: 501, worker_code: 'W-A' };
const accountB = { id: 202, role: 'worker', worker_id: 502, worker_code: 'W-B' };
const journalKey = 'ktcReliableProductionSubmitV1';

function createHarness() {
  const original = {};
  for (const key of ['localStorage', 'navigator', 'window']) {
    original[key] = Object.getOwnPropertyDescriptor(globalThis, key);
  }
  const storage = new Map();
  const localStorage = {
    getItem(key) { return storage.get(key) || null; },
    setItem(key, value) { storage.set(key, String(value)); },
    removeItem(key) { storage.delete(key); }
  };
  let user = accountA;
  const moved = [];
  const requestInterceptors = [];
  const responseInterceptors = [];
  const api = {
    interceptors: {
      request: { use(handler) { requestInterceptors.push(handler); } },
      response: { use(ok, bad) { responseInterceptors.push({ ok, bad }); } },
    }
  };
  class AxiosHeaders {
    static from(headers) {
      return { get(key) { return headers?.[key] || null; } };
    }
  }
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: localStorage });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { addEventListener() {}, setTimeout() {}, setInterval() {} },
  });

  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const mod = new Module(file, module);
  mod.filename = file;
  mod.paths = module.paths;
  mod.require = (id) => {
    if (id === 'axios') return { AxiosHeaders };
    if (id === './api') return { api };
    if (id === '../utils/authStorage') return { getStoredUser: () => user };
    if (id === './offlineReportQueue') {
      return {
        enqueueOfflineReport(payload) {
          moved.push({ worker: user?.worker_code, payload });
          return { id: 'queued' };
        }
      };
    }
    throw new Error('Unexpected import: ' + id);
  };
  mod._compile(code, file);
  const owner = (userValue) => ({
    userId: userValue.id, workerId: userValue.worker_id,
    workerCode: userValue.worker_code
  });
  const items = () => JSON.parse(storage.get(journalKey) || '[]');
  const insert = (...records) => storage.set(journalKey, JSON.stringify(records));
  const item = (userValue, requestId) => ({
    clientRequestId: requestId,
    createdAt: Date.now(),
    owner: owner(userValue),
    payload: { client_request_id: requestId, work_date: '2026-10-30', process_id: 1 },
  });
  const tick = async () => {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setImmediate(resolve));
  };
  return {
    module: mod.exports, storage, moved, owner, items, insert, item,
    requestInterceptors, responseInterceptors, tick,
    setUser(next) { user = next; },
    cleanup() {
      for (const [key, descriptor] of Object.entries(original)) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
    }
  };
}

test('journal recovery never queues another worker report on shared device', async () => {
  const h = createHarness();
  try {
    h.insert(h.item(accountA, 'request-A'), h.item(accountB, 'request-B'));
    h.setUser(accountB);
    h.module.recoverReliableReportJournal();
    await h.tick();
    assert.deepEqual(h.moved.map((x) => x.worker), ['W-B']);
    assert.deepEqual(h.moved.map((x) => x.payload.client_request_id), ['request-B']);
    assert.deepEqual(h.items().map((x) => x.clientRequestId), ['request-A']);

    h.setUser(accountA);
    h.module.recoverReliableReportJournal();
    await h.tick();
    assert.deepEqual(h.moved.map((x) => x.payload.client_request_id), ['request-B', 'request-A']);
    assert.deepEqual(h.items(), []);
  } finally { h.cleanup(); }
});

test('no signed-in worker never recovers or deletes a journal belonging to another account', async () => {
  const h = createHarness();
  try {
    h.insert(h.item(accountA, 'request-A'));
    h.setUser(null);
    h.module.recoverReliableReportJournal();
    await h.tick();
    assert.equal(h.moved.length, 0);
    assert.equal(h.items().length, 1);
  } finally { h.cleanup(); }
});

test('switching accounts during asynchronous recovery does not enqueue the old owner payload', async () => {
  const h = createHarness();
  try {
    h.insert(h.item(accountA, 'request-A'));
    h.setUser(accountA);
    h.module.recoverReliableReportJournal();
    h.setUser(accountB);
    await h.tick();
    assert.deepEqual(h.moved, []);
    assert.equal(h.items().length, 1);
  } finally { h.cleanup(); }
});

test('a successful POST only removes its originating owner journal record', async () => {
  const h = createHarness();
  try {
    h.insert(h.item(accountA, 'same-request-id'), h.item(accountB, 'same-request-id'));
    h.module.initializeReliableReportRecovery();
    const config = h.requestInterceptors[0]({
      method: 'post', url: '/production-temp',
      data: JSON.stringify({ client_request_id: 'same-request-id' }),
      headers: {}
    });
    h.setUser(accountB);
    h.responseInterceptors[0].ok({ config, data: { success: true } });
    assert.deepEqual(h.items().map((x) => x.owner.userId), [202]);
  } finally { h.cleanup(); }
});

test('manual journal clear cannot erase another worker report with the same client id', async () => {
  const h = createHarness();
  try {
    h.insert(h.item(accountA, 'same-request-id'), h.item(accountB, 'same-request-id'));
    h.setUser(accountB);
    h.module.clearReliableReportJournal('same-request-id');
    assert.deepEqual(h.items().map((x) => x.owner.userId), [101]);
  } finally { h.cleanup(); }
});
