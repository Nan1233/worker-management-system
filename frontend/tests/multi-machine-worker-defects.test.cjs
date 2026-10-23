'use strict';
// Wiring guard: detail/edit screens must read worker-declared defects through getWorkerDeclaredDefects
// so machine-line defects are never shown or re-saved as worker-declared (parent) defects.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (rel) => fs.readFileSync(path.join(__dirname, '..', 'src', rel), 'utf8');

test('helper prefers worker_defects only for reports with machine lines', () => {
  const src = read('utils/workerDeclaredDefects.ts');
  assert.match(src, /lines\.length > 0 && Array\.isArray\(report\.worker_defects\)/);
  assert.match(src, /return report\.defects as T\[\]/);
});

for (const file of ['pages/worker/WorkerReportEditV2.tsx', 'pages/worker/ProductionReadonlyDetail.tsx', 'pages/worker/WorkerReportFormDetail.tsx', 'pages/manager/ReportReviewDetail.tsx']) {
  test(`${file} uses getWorkerDeclaredDefects`, () => {
    assert.match(read(file), /getWorkerDeclaredDefects/);
  });
}

for (const file of ['pages/worker/WorkerReportEditV2.tsx', 'pages/manager/ReportReviewDetail.tsx']) {
  test(`${file} blocks saving when machine data is incomplete`, () => {
    const src = read(file);
    assert.match(src, /detectIncompleteMachineData\(/);
    assert.match(src, /if \(incompleteMessage\) \{ setError\(incompleteMessage\); return; \}/);
  });
}

test('integrity helper flags load failures and short machine lists', () => {
  const src = read('utils/machineLinesIntegrity.ts');
  assert.match(src, /machine_lines_load_failed/);
  assert.match(src, /declared > 1 && lines\.length < declared/);
});

function loadTs(rel) {
  const ts = require('typescript');
  const out = ts.transpileModule(read(rel), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', out)(mod, mod.exports);
  return mod.exports;
}

test('getWorkerDeclaredDefects behaves as specified (runtime)', () => {
  const { getWorkerDeclaredDefects } = loadTs('utils/workerDeclaredDefects.ts');
  const merged = [{ defect_name: 'machine' }];
  const parent = [{ defect_name: 'worker' }];
  assert.deepEqual(getWorkerDeclaredDefects({ machine_lines: [{}], defects: merged, worker_defects: parent }), parent);
  assert.deepEqual(getWorkerDeclaredDefects({ machine_lines: [{}], defects: merged, worker_defects: [] }), []);
  assert.deepEqual(getWorkerDeclaredDefects({ machine_lines: [], defects: merged, worker_defects: parent }), merged, 'manual report keeps legacy-aware defects');
  assert.deepEqual(getWorkerDeclaredDefects({ machine_lines: [{}], defects: merged }), merged, 'old API without worker_defects');
  assert.deepEqual(getWorkerDeclaredDefects(null), []);
});

test('detectIncompleteMachineData (runtime)', () => {
  const { detectIncompleteMachineData } = loadTs('utils/machineLinesIntegrity.ts');
  assert.ok(detectIncompleteMachineData({ machine_lines_load_failed: true, machine_lines: [] }));
  assert.ok(detectIncompleteMachineData({ operation_mode: 'MACHINE', machine_no: 'M1, M2, M3', machine_lines: [{}, {}] }));
  assert.ok(detectIncompleteMachineData({ operation_mode: 'MACHINE', machine_no: 'M1, M2', machine_lines: [] }));
  assert.equal(detectIncompleteMachineData({ operation_mode: 'MACHINE', machine_no: 'M1, M2', machine_lines: [{}, {}] }), null);
  assert.equal(detectIncompleteMachineData({ operation_mode: 'MANUAL', machine_no: null, machine_lines: [] }), null);
  assert.equal(detectIncompleteMachineData({ operation_mode: 'MACHINE', machine_no: 'M1', machine_lines: [] }), null, 'legacy single-machine report is allowed');
  assert.equal(detectIncompleteMachineData(null), null);
});

test('ManagerReportGrid marks failed detail loads and refuses to save them or incomplete machine data', () => {
  const src = read('pages/manager/ManagerReportGrid.tsx');
  assert.match(src, /catch\{return \{\.\.\.x,detail_load_failed:true\} as ProductionReport\}/);
  assert.match(src, /detail_load_failed\|\|\(r as ProductionReport/);
  assert.match(src, /detectIncompleteMachineData\(d as never\)/);
});
