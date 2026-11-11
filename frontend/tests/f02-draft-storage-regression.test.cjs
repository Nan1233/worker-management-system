'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function harness({ initial = {}, failWrite = false, silentWrite = false } = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../src/pages/worker/processDraftStorage.ts'), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const data = new Map(Object.entries(initial));
  let user = { worker_id: 49, worker_code: '49-001', role: 'worker' };
  const events = [];
  const storage = {
    getItem: (key) => data.get(key) ?? null,
    setItem(key, value) {
      if (failWrite) throw new Error('QuotaExceededError');
      if (!silentWrite) data.set(key, String(value));
    },
    removeItem(key) { data.delete(key); }
  };
  const mod = { exports: {} };
  const sandbox = {
    module: mod, exports: mod.exports,
    require(id) {
      if (id === '../../utils/authStorage') return { getStoredUser: () => user };
      if (id === './processPageConfig') return {
        getCurrentLocalDate: () => '2026-11-11',
        createEmptyMachineLine: () => ({
          machineCode: '', productCode: '', hours: '', minutes: '',
          okQuantity: '', ngQuantity: '', defects: {}, deductions: {}
        })
      };
      throw new Error('Unexpected import: ' + id);
    },
    localStorage: storage,
    window: { dispatchEvent(event) { events.push(event.type); }, confirm: () => true },
    Event: class Event { constructor(type) { this.type = type; } },
    Date, JSON, Number, String, Object, Array, Math
  };
  vm.runInNewContext(compiled, sandbox, { filename: 'processDraftStorage.js' });
  return { draft: mod.exports, data, events, setUser(next) { user = next; } };
}

function sampleDraft() {
  return {
    version: 3, savedAt: Date.now(), process: 'gc',
    form: { workDate: '2026-11-11', shift: 'A', machineNo: 'C01', productName: 'P01' },
    deductions: {}, selectedDeduction: [], selectedNg: [],
    machineLines: [], machineCount: 1,
    operationType: 'CUT', operationMode: 'MANUAL', extraData: {}
  };
}

test('draft autosave persists owned worker report and survives refresh', () => {
  const h = harness();
  h.draft.saveProcessDraft(sampleDraft());
  const restored = h.draft.loadProcessDraft('gc');
  assert.ok(restored);
  assert.equal(restored.ownerWorkerId, 49);
  assert.equal(restored.form.productName, 'P01');
  assert.equal(h.events.length, 0);
});

test('a corrupt existing draft is never overwritten by autosave', () => {
  const key = 'ktc:process-draft:v3:id-49:gc';
  const h = harness({ initial: { [key]: '{partial-json' } });
  h.draft.saveProcessDraft(sampleDraft());
  assert.equal(h.data.get(key), '{partial-json');
  assert.deepEqual(h.events, [h.draft.PROCESS_DRAFT_SAVE_FAILED_EVENT]);
});

test('autosave signals storage quota failure instead of silently pretending the draft is safe', () => {
  const h = harness({ failWrite: true });
  h.draft.saveProcessDraft(sampleDraft());
  assert.deepEqual(h.events, [h.draft.PROCESS_DRAFT_SAVE_FAILED_EVENT]);
});

test('autosave detects browser storage silently discarding writes', () => {
  const h = harness({ silentWrite: true });
  h.draft.saveProcessDraft(sampleDraft());
  assert.deepEqual(h.events, [h.draft.PROCESS_DRAFT_SAVE_FAILED_EVENT]);
});

test('another worker cannot read the previous worker draft', () => {
  const h = harness();
  h.draft.saveProcessDraft(sampleDraft());
  h.setUser({ worker_id: 50, worker_code: '50-001', role: 'worker' });
  assert.equal(h.draft.loadProcessDraft('gc'), null);
});

test('draft autosave omits empty machine-line defaults but restores them', () => {
  const h = harness();
  const input = sampleDraft();
  input.machineLines = [{
    machineCode: 'C5', productCode: 'P01', hours: '8', minutes: '',
    okQuantity: '120', ngQuantity: '', defects: {}, deductions: {}
  }];
  h.draft.saveProcessDraft(input);
  const key = 'ktc:process-draft:v3:id-49:gc';
  const saved = JSON.parse(h.data.get(key));
  assert.equal(saved.machineLines[0].machineCode, 'C5');
  assert.equal(saved.machineLines[0].hours, '8');
  assert.equal(Object.hasOwn(saved.machineLines[0], 'defects'), false);
  assert.equal(Object.hasOwn(saved.machineLines[0], 'deductions'), false);
  const restored = h.draft.loadProcessDraft('gc');
  assert.equal(restored.machineLines[0].machineCode, 'C5');
  assert.equal(restored.machineLines[0].hours, '8');
  assert.deepEqual(Object.keys(restored.machineLines[0].defects), []);
});
