'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '../src/pages/worker');
const source = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const transpile = (name) => ts.transpileModule(source(name), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function loadHook(name, imports) {
  const mod = { exports: {} };
  vm.runInNewContext(transpile(name), {
    module: mod,
    exports: mod.exports,
    require: (id) => {
      if (!(id in imports)) throw new Error('Unexpected dependency: ' + id);
      return imports[id];
    },
  }, { filename: name.replace('.ts', '.js') });
  return mod.exports;
}

test('single-product standard lookup ignores stale result and preserves manual standard on request failure', async () => {
  const effects = [];
  const requests = [];
  const { useProcessSingleStandardLookup } = loadHook('useProcessSingleStandardLookup.ts', {
    react: { useEffect: (fn) => effects.push(fn) },
    '../../services/masterDataService': {
      resolveProductStandard: (...args) => new Promise((resolve, reject) => requests.push({ args, resolve, reject })),
    },
  });
  let form = { productName: 'P1', machineNo: 'C01', workDate: '2026-11-19', standardOutput: '5' };
  const setForm = (update) => { form = update(form); };
  useProcessSingleStandardLookup(1, form, setForm);
  const cancelFirst = effects.shift()();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].args.join('|'), '1|C01|P1|2026-11-19');

  // Selection changed: response to the old product must not change the current standard.
  cancelFirst();
  form = { ...form, productName: 'P2' };
  useProcessSingleStandardLookup(1, form, setForm);
  const cancelSecond = effects.shift()();
  requests[0].resolve({ resolved_output_per_hour: 900 });
  await Promise.resolve();
  assert.equal(form.standardOutput, '5');
  requests[1].resolve({ resolved_output_per_hour: 25 });
  await Promise.resolve();
  assert.equal(form.standardOutput, '25');
  cancelSecond();

  // A failed lookup must leave the entered/current standard intact.
  useProcessSingleStandardLookup(1, form, setForm);
  effects.shift()();
  requests[2].reject(new Error('offline'));
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(form.standardOutput, '25');
});

test('draft-save warning is shown at most once per mount and unsubscribes on cleanup', () => {
  const effects = [];
  const callbacks = new Map();
  const notifications = [];
  const hook = loadHook('useProcessDraftSaveWarning.ts', {
    react: { useRef: (initial) => ({ current: initial }), useEffect: (fn) => effects.push(fn) },
    './processDraftStorage': { PROCESS_DRAFT_SAVE_FAILED_EVENT: 'ktc:draft-save-failed' },
  });
  // The hook captures window only when the effect runs; provide it to the VM
  // through a second module instantiation with the same mocks.
  const mod = { exports: {} };
  vm.runInNewContext(transpile('useProcessDraftSaveWarning.ts'), {
    module: mod, exports: mod.exports,
    window: {
      addEventListener: (name, fn) => callbacks.set(name, fn),
      removeEventListener: (name, fn) => { if (callbacks.get(name) === fn) callbacks.delete(name); },
    },
    require: (id) => {
      if (id === 'react') return { useRef: (initial) => ({ current: initial }), useEffect: (fn) => effects.push(fn) };
      if (id === './processDraftStorage') return { PROCESS_DRAFT_SAVE_FAILED_EVENT: 'ktc:draft-save-failed' };
      throw new Error('Unexpected dependency: ' + id);
    },
  });
  mod.exports.useProcessDraftSaveWarning((message, type) => notifications.push({ message, type }));
  const dispose = effects.pop()();
  callbacks.get('ktc:draft-save-failed')();
  callbacks.get('ktc:draft-save-failed')();
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].type, 'warning');
  assert.match(notifications[0].message, /Không thể lưu bản nháp/);
  dispose();
  assert.equal(callbacks.size, 0);
  assert.equal(typeof hook.useProcessDraftSaveWarning, 'function');
});

test('worker page delegates hooks and retains the production payload builder', () => {
  const page = source('ProcessPage.tsx');
  assert.match(page, /useProcessSingleStandardLookup\(processInfo\.id, form, setForm\)/);
  assert.match(page, /useProcessDraftSaveWarning\(showToast\)/);
  assert.match(page, /buildProductionReportPayloads\(\{/);
  assert.match(page, /clientRequestIdRef\.current/);
  assert.match(page, /submitLockRef\.current/);
  assert.doesNotMatch(page, /resolveProductStandard\(/);
});
