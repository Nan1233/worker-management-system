'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { buildProcessWorkbookLocal, _private: { reportSnapshot } } = require('../electron/monthlyWorkbookLocal.cjs');

function fixture(overrides = {}) {
  return {
    process_code: 'MAI',
    operation_mode: 'MACHINE',
    worker_code: '4333',
    total_time: 10.6667,
    actual_time: 10.6667,
    deduction_time: 0,
    deductions: [
      { deduction_type_code: 'NGHI_GIAI_LAO', hours: 1.1666666666666667 },
      { deduction_type_code: '5S', hours: 0.16666666666666666 }
    ],
    ...overrides
  };
}

test('MAI: Excel total equals recorded detail when approved deduction total is zero', () => {
  const report = fixture();
  const snapshot = reportSnapshot(report);
  assert.ok(Math.abs(snapshot.deductionTime - (4 / 3)) < 1e-9);
  assert.equal(report.deduction_time, 0, 'never mutate approved report data');
  assert.equal(snapshot.actualTime, 10.6667, 'preserve approved actual_time snapshot');
});

test('MAI: nonzero approved total is not overwritten by deduction details', () => {
  const snapshot = reportSnapshot(fixture({ deduction_time: 1.5 }));
  assert.equal(snapshot.deductionTime, 1.5);
});

test('MAI: absent details cannot create a false deduction total', () => {
  const snapshot = reportSnapshot(fixture({ deductions: [] }));
  assert.equal(snapshot.deductionTime, 0);
});

test('GC MACHINE: preserve per-machine accounting, not parent detail fallback', () => {
  const snapshot = reportSnapshot(fixture({
    process_code: 'GC',
    operation_mode: 'MACHINE',
    calculationSnapshot: {
      trainingFactor: 1, standard: 10, workingTime: 8, actualTime: 7,
      deductionTime: 0, ok: 30, allNg: 0, countedNg: 0,
      enteredOutput: 30, adjustedOutput: 30, outputPerHour: 30 / 7,
      achievement: 0.4, ngRate: 0
    }
  }));
  assert.equal(snapshot.deductionTime, 0);
});

test('MAI Workbook1 real export: L3 matches rendered W3 + Z3, while J3/K3 stay approved snapshots', async () => {
  const report = fixture({
    id: 4333, full_name: 'Test worker', shift: 'A', machine_no: '16',
    work_date: '2026-11-06', created_at: '2026-11-06T12:00:00',
    product_code: '9276-15', standard_output: 350, tt_ok: 3731,
    tt_ng: 0, actual_output: 3731, training_percent_snapshot: 100,
    dataSource: 'production_reports', isApprovedDatabaseRecord: true,
    deductions: [
      { deduction_type_code: 'NGHI_GIAI_LAO', deduction_type_name: 'Nghỉ giải lao', hours: 7/6 },
      { deduction_type_code: '5S', deduction_type_name: '5s, đổ bụi,xì bụi,lấy bụi', hours: 1/6 }
    ]
  });
  const built = await buildProcessWorkbookLocal({
    date: '2026-11-01', processCode: 'MAI',
    payload: { yearMonth: '2026-11', dataSource: 'tidb.production_reports.approved',
      processes: { MAI: { reports: [report] } } }
  });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(built.buffer);
  const sheet = workbook.getWorksheet('Mài');
  assert.ok(sheet);
  assert.ok(Math.abs(sheet.getCell('W3').value - 7/6) < 1e-9);
  assert.ok(Math.abs(sheet.getCell('Z3').value - 1/6) < 1e-9);
  assert.ok(Math.abs(sheet.getCell('L3').value - 4/3) < 1e-9);
  assert.equal(sheet.getCell('J3').value, 10.6667);
  assert.equal(sheet.getCell('K3').value, 10.6667);
});

test('MAI MACHINE legacy snapshot: preserve approved actual_time even when zero', () => {
  const report = fixture({
    total_time: 6.6667,
    actual_time: 0,
    deduction_time: 1,
    deductions: [{ deduction_type_name: 'Nghỉ giải lao', hours: 1 }],
    calculationSnapshot: {
      trainingFactor: 1, standard: 120, workingTime: 6.6667,
      actualTime: 0, deductionTime: 1, ok: 709, allNg: 0,
      countedNg: 0, enteredOutput: 709, adjustedOutput: 709,
      outputPerHour: null, achievement: null, ngRate: 0
    }
  });
  const snapshot = reportSnapshot(report);
  assert.equal(snapshot.actualTime, 0);
  assert.equal(snapshot.outputPerHour, null);
  assert.equal(snapshot.achievement, null);
  assert.equal(report.calculationSnapshot.actualTime, 0);
});

test('MAI MACHINE invalid effective time: do not infer productivity from negative hours', () => {
  const snapshot = reportSnapshot(fixture({
    calculationSnapshot: {
      trainingFactor: 1, standard: 85, workingTime: 5, actualTime: 0,
      deductionTime: 7, ok: 350, allNg: 0, countedNg: 0,
      enteredOutput: 350, adjustedOutput: 350,
      outputPerHour: null, achievement: null, ngRate: 0
    }
  }));
  assert.equal(snapshot.actualTime, 0);
  assert.equal(snapshot.outputPerHour, null);
  assert.equal(snapshot.achievement, null);
});
