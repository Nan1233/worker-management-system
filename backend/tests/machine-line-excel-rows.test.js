'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildMachineExcelRows } = require('../services/machineLineExcelRows');

const report = (overrides = {}) => ({
  id: 1,
  process_code: 'MAI',
  operation_mode: 'MACHINE',
  worker_id: 10,
  worker_code: 'CN001',
  full_name: 'Worker One',
  work_date: '2026-10-23',
  product_name: 'SP-PARENT',
  total_time: 12,
  actual_time: 10,
  actual_output: 999,
  tt_ok: 900,
  tt_ng: 99,
  machineLines: [{
    id: 101, sort_order: 1, machine_code: 'M01', product_code: 'SP001',
    machine_time_hours: 4, deduction_time_hours: 1, standard_output: 100,
    ok_quantity: 100, ng_quantity: 5, exclude_kqd_from_tt: 0,
    deductions_json: JSON.stringify([{ deduction_type_id: 2, deduction_name: 'Chờ hàng', hours: 1 }]),
    defects_json: JSON.stringify([{ defect_type_id: 3, defect_name: 'Lỗi A', quantity: 5 }])
  }],
  ...overrides
});

test('one machine line produces one machine-worker row with line-level values', () => {
  const rows = buildMachineExcelRows([report()]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].machine_no, 'M01');
  assert.equal(rows[0].worker_code, 'CN001');
  assert.equal(rows[0].product_name, 'SP001');
  assert.equal(rows[0].actual_output, 105);
  assert.equal(rows[0].tt_ok, 100);
  assert.equal(rows[0].tt_ng, 5);
  assert.equal(rows[0].total_time, 4);
  assert.equal(rows[0].actual_time, 3);
  assert.deepEqual(rows[0].defects.map((x) => x.quantity), [5]);
  assert.deepEqual(rows[0].deductions.map((x) => x.hours), [1]);
});

test('multiple machines operated by one worker produce one row per machine', () => {
  const r = report({ machineLines: [
    report().machineLines[0],
    { ...report().machineLines[0], id: 102, sort_order: 2, machine_code: 'M02', product_code: 'SP002', machine_time_hours: 5, ok_quantity: 150, ng_quantity: 0, deductions_json: '[]', defects_json: '[]', deduction_time_hours: 0 }
  ]});
  const rows = buildMachineExcelRows([r]);
  assert.deepEqual(rows.map((x) => [x.machine_no, x.worker_code, x.actual_output]), [['M01', 'CN001', 105], ['M02', 'CN001', 150]]);
});

test('multiple reports with multiple machines preserve each worker-machine pair', () => {
  const a = report({ id: 1, machineLines: [
    ...report().machineLines,
    { ...report().machineLines[0], id: 102, sort_order: 2, machine_code: 'M02', ok_quantity: 20, ng_quantity: 0, defects_json: '[]', deductions_json: '[]', deduction_time_hours: 0 }
  ]});
  const b = report({ id: 2, worker_id: 11, worker_code: 'CN002', full_name: 'Worker Two', machineLines: [
    { ...report().machineLines[0], id: 201, machine_code: 'M03', ok_quantity: 120, ng_quantity: 0, defects_json: '[]', deductions_json: '[]', deduction_time_hours: 0 }
  ]});
  const rows = buildMachineExcelRows([a, b]);
  assert.deepEqual(rows.map((x) => [x.worker_code, x.machine_no]), [['CN001', 'M01'], ['CN001', 'M02'], ['CN002', 'M03']]);
});

test('two workers sharing one physical machine retain separate worker credits', () => {
  const first = report({ machineLines: [{ ...report().machineLines[0], machine_code: 'M01', ok_quantity: 60, ng_quantity: 0, defects_json: '[]' }]});
  const second = report({ id: 2, worker_id: 11, worker_code: 'CN002', machineLines: [
    { ...report().machineLines[0], id: 201, machine_code: 'M01', ok_quantity: 40, ng_quantity: 0, defects_json: '[]' }
  ]});
  const rows = buildMachineExcelRows([first, second]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((x) => [x.machine_no, x.worker_code, x.actual_output]), [['M01', 'CN001', 60], ['M01', 'CN002', 40]]);
  assert.equal(rows.reduce((sum, x) => sum + x.actual_output, 0), 100);
});

test('Mài report with multiple machine lines is expanded without parent aggregate duplication', () => {
  const r = report({ process_code: 'MAI', actual_output: 777, tt_ok: 700, tt_ng: 77, machineLines: [
    { ...report().machineLines[0], machine_code: 'M01', ok_quantity: 100, ng_quantity: 0, defects_json: '[]' },
    { ...report().machineLines[0], id: 102, sort_order: 2, machine_code: 'M02', ok_quantity: 150, ng_quantity: 0, defects_json: '[]', deductions_json: '[]', deduction_time_hours: 0 }
  ]});
  const rows = buildMachineExcelRows([r]);
  assert.equal(rows.length, 2);
  assert.equal(rows.reduce((sum, x) => sum + x.actual_output, 0), 250);
  assert.deepEqual(rows.map((x) => x.machine_no), ['M01', 'M02']);
});

test('Đo and Ép one-machine reports remain one row each', () => {
  const doReport = report({ process_code: 'DO' });
  const epReport = report({ id: 2, process_code: 'EP', machineLines: [
    { ...report().machineLines[0], id: 201, machine_code: 'EP01' }
  ]});
  const rows = buildMachineExcelRows([doReport, epReport]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((x) => [x.process_code, x.machine_no]), [['DO', 'M01'], ['EP', 'EP01']]);
});

test('multiple reports in one month keep manual rows and do not duplicate machine rows', () => {
  const multi = report({ machineLines: [
    ...report().machineLines,
    { ...report().machineLines[0], id: 102, sort_order: 2, machine_code: 'M02', ok_quantity: 10, ng_quantity: 0, defects_json: '[]', deductions_json: '[]', deduction_time_hours: 0 }
  ]});
  const manual = report({ id: 3, operation_mode: 'MANUAL', machine_no: null, machineLines: [], actual_output: 25, tt_ok: 25, tt_ng: 0, total_time: 2, actual_time: 2 });
  const other = report({ id: 4, work_date: '2026-10-24', machineLines: [
    { ...report().machineLines[0], id: 401, machine_code: 'M04', ok_quantity: 7, ng_quantity: 0, defects_json: '[]', deductions_json: '[]', deduction_time_hours: 0 }
  ]});
  const rows = buildMachineExcelRows([multi, manual, other]);
  assert.equal(rows.length, 4);
  assert.equal(rows.filter((x) => x.id === 1).length, 2);
  assert.equal(rows.find((x) => x.id === 3).actual_output, 25);
  assert.equal(rows.reduce((sum, x) => sum + x.actual_output, 0), 105 + 10 + 25 + 7);
});

test('line totals and time are preserved; parent aggregate is not multiplied', () => {
  const r = report({ actual_output: 9999, total_time: 99, actual_time: 90, machineLines: [
    { ...report().machineLines[0], machine_code: 'M01', machine_time_hours: 2, deduction_time_hours: 0, ok_quantity: 10, ng_quantity: 1, deductions_json: '[]', defects_json: '[]' },
    { ...report().machineLines[0], id: 102, sort_order: 2, machine_code: 'M02', machine_time_hours: 3, deduction_time_hours: 1, ok_quantity: 20, ng_quantity: 2, deductions_json: JSON.stringify([{ deduction_name: 'Chờ hàng', hours: 1 }]), defects_json: '[]' }
  ]});
  const rows = buildMachineExcelRows([r]);
  assert.equal(rows.reduce((sum, x) => sum + x.actual_output, 0), 33);
  assert.equal(rows.reduce((sum, x) => sum + x.total_time, 0), 5);
  assert.equal(rows.reduce((sum, x) => sum + x.actual_time, 0), 4);
  assert.notEqual(rows.reduce((sum, x) => sum + x.actual_output, 0), 19998);
});

test('both active workbook writers use the same machine-row expansion helper', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.join(__dirname, '..');
  const processWriter = fs.readFileSync(path.join(root, 'services/templateDrivenProcessExcelExportService.js'), 'utf8');
  const companyWriter = fs.readFileSync(path.join(root, 'services/companyExcelExportService.js'), 'utf8');
  const companyAllWriter = fs.readFileSync(path.join(root, 'services/companyMaiDoExcelService.js'), 'utf8');
  assert.match(processWriter, /buildMachineExcelRows\(reports\)/);
  assert.match(processWriter, /exportRows\.length/);
  assert.match(companyWriter, /buildMachineExcelRows\(reports\)/);
  assert.match(companyWriter, /exportRows\.forEach/);
  assert.match(companyAllWriter, /buildMachineExcelRows\(reports\)/);
  assert.doesNotMatch(companyAllWriter, /dayReports\.slice\(0, rowNumbers\.length\)/);
});
