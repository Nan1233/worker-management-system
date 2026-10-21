const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = () => import(pathToFileURL(path.join(__dirname, '../src/services/gcMachineWorkType.js')).href);
const MASTER = [
  { machine_code: 'C1', gc_work_type: 'CUT' }, { machine_code: 'C13', gc_work_type: 'CUT' },
  { machine_code: 'ML4', gc_work_type: 'LONG' }, { machine_code: 'ML21', gc_work_type: 'LONG' },
  { machine_code: 'C14', gc_work_type: null }, { machine_code: 'Z9' },
];

test('FE resolves the work type from the machine master (C13, ML21) and never by prefix', async () => {
  const { gcWorkTypeOfMachine } = await load();
  assert.equal(gcWorkTypeOfMachine(MASTER, 'C13'), 'CUT');
  assert.equal(gcWorkTypeOfMachine(MASTER, ' c13 '), 'CUT');
  assert.equal(gcWorkTypeOfMachine(MASTER, 'ML21'), 'LONG');
  for (const code of ['C14', 'Z9', 'C99', '', null, undefined]) assert.equal(gcWorkTypeOfMachine(MASTER, code), null, String(code));
  assert.equal(gcWorkTypeOfMachine(null, 'C13'), null);
});

test('FE machine options are scoped by master type; unconfigured machines are hidden', async () => {
  const { scopeGcMachineOptions } = await load();
  const options = MASTER.map((m) => ({ value: m.machine_code, workType: m.gc_work_type ?? null }));
  assert.deepEqual(scopeGcMachineOptions(options, 'CUT').map((o) => o.value), ['C1', 'C13']);
  assert.deepEqual(scopeGcMachineOptions(options, 'LONG').map((o) => o.value), ['ML4', 'ML21']);
});

test('FE and BE agree on the same fixture (same type for C13, ML21 and unconfigured machines)', async () => {
  const { gcWorkTypeOfMachine } = await load();
  const be = require('../../backend/utils/gcMachineWorkType');
  for (const m of MASTER) {
    const fe = gcWorkTypeOfMachine(MASTER, m.machine_code);
    assert.equal(fe, be.normalizeMachineGcWorkType(m.gc_work_type), m.machine_code);
  }
});

test('FE sources no longer hardcode prefix inference for the standard resolution', () => {
  const svc = fs.readFileSync(path.join(__dirname, '../src/services/masterDataService.ts'), 'utf8');
  assert.doesNotMatch(svc, /inferGcWorkType/);
  assert.match(svc, /gcWorkTypeOfMachine/);
});
