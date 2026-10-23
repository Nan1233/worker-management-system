'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const ExcelJS = require('exceljs');
const { __test, buildCommonProcessMonthlyWorkbook } = require('../services/commonProcessMonthlyExcelService');

const line = (id, machine, product, hours, ok, ng, deductions = [], defects = []) => ({
  id, sort_order: id, machine_code: machine, product_code: product, machine_time_hours: hours,
  standard_output: 100, ok_quantity: ok, ng_quantity: ng,
  deductions_json: JSON.stringify(deductions), defects_json: JSON.stringify(defects)
});
const report = (overrides = {}) => ({
  id: 1, process_code: 'GC', process_name: 'Cắt lồng', operation_mode: 'MACHINE',
  worker_id: 10, worker_code: 'CN01', full_name: 'Công nhân 1', work_date: '2026-10-02', training_percent: 100,
  total_time: 12, actual_time: 10, deduction_time: 2, standard_output: 999,
  actual_output: 9999, tt_ok: 9000, tt_ng: 999,
  deductions: [{ deduction_type_id: 9, deduction_name: 'TỔNG', hours: 99 }],
  defects: [{ defect_type_id: 8, defect_name: 'Lỗi tổng', quantity: 999 }],
  machineLines: [
    line(101, 'M01', 'SP01', 4, 100, 2, [{ deduction_type_id: 1, deduction_name: 'Chờ hàng', hours: 1 }], [{ defect_type_id: 2, defect_name: 'Lỗi A', quantity: 2 }]),
    line(102, 'M02', 'SP02', 5, 200, 3, [{ deduction_type_id: 3, deduction_name: '5S', hours: 0.5 }], [{ defect_type_id: 4, defect_name: 'Lỗi B', quantity: 3 }])
  ],
  ...overrides
});

test('one machine line produces exactly one machine-worker row', () => {
  const rows = __test.expandGiaCongMachineLines([report({ machineLines: [line(101, 'M01', 'SP01', 4, 100, 2)] })]);
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].worker_code, rows[0].machine_no, rows[0].actual_output], ['CN01', 'M01', 102]);
});

test('one worker operating multiple machines gets separate line-level rows without parent totals', () => {
  const rows = __test.expandGiaCongMachineLines([report()]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => [r.worker_code, r.machine_no, r.product_name]), [['CN01', 'M01', 'SP01'], ['CN01', 'M02', 'SP02']]);
  assert.deepEqual(rows.map((r) => [r.tt_ok, r.tt_ng, r.actual_output]), [[100, 2, 102], [200, 3, 203]]);
  assert.deepEqual(rows.map((r) => [r.excelExportTimes.totalHours, r.excelExportTimes.actualHours, r.excelExportTimes.deductionHours]), [[4, 3, 1], [5, 4.5, 0.5]]);
  assert.deepEqual(rows.map((r) => r.defects[0].quantity), [2, 3]);
  assert.equal(rows.reduce((sum, r) => sum + r.actual_output, 0), 305);
  assert.notEqual(rows.reduce((sum, r) => sum + r.actual_output, 0), 9999 * 2);
});

test('multiple workers and multiple machines preserve every machine-worker pair', () => {
  const a = report();
  const b = report({ id: 2, worker_id: 11, worker_code: 'CN02', full_name: 'Công nhân 2',
    machineLines: [line(201, 'M01', 'SP01', 3, 40, 0), line(202, 'M03', 'SP03', 2, 70, 1)] });
  const rows = __test.expandGiaCongMachineLines([a, b]);
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map((r) => [r.worker_code, r.machine_no]), [['CN01', 'M01'], ['CN01', 'M02'], ['CN02', 'M01'], ['CN02', 'M03']]);
});

test('multiple workers sharing one machine remain separate credits; repeated builds do not duplicate rows', () => {
  const source = [
    report({ machineLines: [line(101, 'M01', 'SP01', 4, 60, 0)] }),
    report({ id: 2, worker_id: 11, worker_code: 'CN02', full_name: 'Công nhân 2', machineLines: [line(201, 'M01', 'SP01', 3, 40, 0)] })
  ];
  const first = __test.expandGiaCongMachineLines(source);
  const second = __test.expandGiaCongMachineLines(source);
  assert.deepEqual(first.map((r) => [r.worker_code, r.machine_no, r.actual_output]), [['CN01', 'M01', 60], ['CN02', 'M01', 40]]);
  assert.deepEqual(second.map((r) => [r.worker_code, r.machine_no, r.actual_output]), first.map((r) => [r.worker_code, r.machine_no, r.actual_output]));
  assert.equal(first.reduce((sum, r) => sum + r.actual_output, 0), 100);
});

test('historical GC reports without machineLines stay one row without fabricated machine data', () => {
  const rows = __test.expandGiaCongMachineLines([report({ machineLines: [], machine_no: '', actual_output: 120, tt_ok: 110, tt_ng: 10 })]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].machine_no, '');
  assert.equal(rows[0].actual_output, 120);
  assert.equal(rows[0].excelExportTimes, undefined);
});

test('non-GC reports are not expanded or rewritten', () => {
  const other = report({ process_code: 'MAI', process_name: 'Mài' });
  const rows = __test.expandGiaCongMachineLines([other]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0], other);
});

test('real monthly workbook serializes distinct GC rows with correct per-line metrics and styles', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ktc-gc-monthly-excel-'));
  const oldRoot = process.env.EXCEL_EXPORT_ROOT;
  process.env.EXCEL_EXPORT_ROOT = root;
  t.after(async () => {
    if (oldRoot === undefined) delete process.env.EXCEL_EXPORT_ROOT;
    else process.env.EXCEL_EXPORT_ROOT = oldRoot;
    await fs.rm(root, { recursive: true, force: true });
  });
  const source = [
    report(),
    report({ id: 2, worker_id: 11, worker_code: 'CN02', full_name: 'Công nhân 2',
      machineLines: [line(201, 'M03', 'SP03', 2, 40, 1)] })
  ];
  const result = await buildCommonProcessMonthlyWorkbook(source, '2026-10');
  const out = new ExcelJS.Workbook();
  await out.xlsx.readFile(result.archivePath);
  const sheet = out.getWorksheet('Cắt lồng');
  assert.ok(sheet);
  assert.deepEqual([sheet.getCell('D3').value, sheet.getCell('D4').value, sheet.getCell('D5').value], ['M01', 'M02', 'M03']);
  assert.deepEqual([sheet.getCell('B3').value, sheet.getCell('B4').value, sheet.getCell('B5').value], ['CN01', 'CN01', 'CN02']);
  assert.deepEqual([sheet.getCell('AC3').value, sheet.getCell('AC4').value, sheet.getCell('AC5').value], [102, 203, 41]);
  assert.deepEqual([sheet.getCell('G3').value, sheet.getCell('H3').value, sheet.getCell('G4').value, sheet.getCell('H4').value], [4, 3, 5, 4.5]);
  assert.deepEqual([sheet.getCell('AB3').value, sheet.getCell('AB4').value], [300, 450]);
  assert.deepEqual([sheet.getCell('AD3').value, sheet.getCell('AD4').value], [102 / 300, 203 / 450]);
  assert.ok(sheet.getRow(3).height > 0);
  assert.equal(sheet.getCell('AD3').numFmt, '0.00%');

  // A repeated export replaces the monthly workbook; it must not append duplicate rows.
  await buildCommonProcessMonthlyWorkbook(source, '2026-10');
  const repeated = new ExcelJS.Workbook();
  await repeated.xlsx.readFile(result.archivePath);
  const repeatedSheet = repeated.getWorksheet('Cắt lồng');
  assert.deepEqual([repeatedSheet.getCell('D3').value, repeatedSheet.getCell('D4').value, repeatedSheet.getCell('D5').value], ['M01', 'M02', 'M03']);
  assert.equal(repeatedSheet.getCell('B6').value, null);
});
