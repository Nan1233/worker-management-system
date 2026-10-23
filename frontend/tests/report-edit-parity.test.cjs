'use strict';
// Edit form must build the SAME payload as the create form and must not send read-only aggregates
// for approved multi-machine reports.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const src = path.join(__dirname, '..', 'src');
const read = (rel) => fs.readFileSync(path.join(src, rel), 'utf8');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: 'commonjs', target: 'es2020', esModuleInterop: true, resolveJsonModule: true } }).outputText, f);
const { buildProductionReportPayload: build } = require(path.join(src, 'pages/worker/processReportSubmission.ts'));
const cfg = require(path.join(src, 'pages/worker/processPageConfig.ts'));
const { buildApprovedMachineNotePatch, isApprovedMachineReport } = require(path.join(src, 'utils/approvedMachineEditPatch.ts'));

const line = (c, p, h) => ({ ...cfg.createEmptyMachineLine(), machineCode: c, productCode: p, hours: String(h), minutes: '0', okQuantity: '100', ngQuantity: '2', deductions: { ...cfg.initialDeduction }, selectedDeductions: [], selectedDefects: ['x'], defects: { x: '2' }, standardOutputPerHour: 500 });
const base = () => ({
  clientRequestId: null, processId: 1, extraData: {}, operationType: 'CUT', isCutLongProcess: true, usesAnyMachine: true, usesMultiMachineLines: true, usesSingleMachine: false,
  form: { ...cfg.initialForm, workDate: '2026-10-23', shift: 'A', workerCode: 'W1', actualHours: '0', actualMinutes: '0', actualTime: '0:00', deductionTime: '0:00', totalTime: '0:00' },
  machineLines: [line('M05', 'P1', 2), line('M06', 'P2', 3)], machineOptions: [], productOptions: [], activeNgOptions: [{ key: 'x', id: 11, code: 'X', label: 'Vỡ' }],
  deductions: { ...cfg.initialDeduction }, activeDeductionOptions: [], excludeKqdFromTt: false,
});

test('GC multi-machine: parent time is 0 only when processCode GC is passed (create parity)', () => {
  const create = build({ ...base(), processCode: 'GC', isCvkMode: false });
  const withoutCode = build(base());
  assert.equal(Number(create.actual_time), 0);
  assert.notEqual(Number(withoutCode.actual_time), 0, 'documents the bug: edit without processCode wrote parent time');
});

test('WorkerReportEditV2 passes processCode and isCvkMode like ProcessPage', () => {
  const edit = read('pages/worker/WorkerReportEditV2.tsx');
  assert.match(edit, /processCode: capabilities\.processCode, isCvkMode,/);
});

test('approved multi-machine patch only carries permitted fields', () => {
  const patch = buildApprovedMachineNotePatch({ note: ' ghi chú ', reason: ' lý do ', updatedAt: '2026-10-23 10:00:00' });
  assert.deepEqual(Object.keys(patch).sort(), ['expected_updated_at', 'note', 'reason']);
  for (const k of ['tt_ok', 'tt_ng', 'actual_output', 'actual_time', 'total_time', 'deduction_time', 'defects', 'deductions', 'machine_no', 'product_name', 'standard_output', 'machine_lines']) assert.equal(k in patch, false);
  assert.equal(patch.reason, 'lý do');
  assert.equal(isApprovedMachineReport('approved', 'MACHINE'), true);
  assert.equal(isApprovedMachineReport('pending', 'MACHINE'), false);
  assert.equal(isApprovedMachineReport('approved', 'MANUAL'), false);
});

test('edit form: no silent returns, no extra status card, shared sections only', () => {
  const edit = read('pages/worker/WorkerReportEditV2.tsx');
  assert.doesNotMatch(edit, /Đã tải dữ liệu báo cáo/);
  assert.match(edit, /Đã hết thời gian 10 phút/);
  assert.match(edit, /\{!usesMultiMachineLines && <ProcessTimeDeductionSection/);
  assert.match(edit, /if \(approvedMachineNoteOnly\)/);
  assert.match(edit, /<fieldset disabled=\{approvedMachineNoteOnly\}/);
});
