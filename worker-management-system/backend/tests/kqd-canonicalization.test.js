const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  KQD_EXCLUSION_CODES,
  isKqdDefect,
  calculateProductionOutput
} = require('../../shared/kqdPolicy.cjs');
const { recalculateReportOutput } = require('../services/kqdReportCalculationService');
const { assertKqdPolicySnapshotConsistency } = require('../services/kqdPolicySnapshotService');
const { calculateProductionMetrics } = require('../domain/productionCalculationEngine.cjs');

test('configured KQD registry is explicit and does not inherit prefix semantics', () => {
  assert.deepEqual(KQD_EXCLUSION_CODES, ['KQD']);
  assert.equal(isKqdDefect({ defect_code: 'KQD' }), true);
  assert.equal(isKqdDefect({ defect_code: 'KQD_TEST' }), false);
  assert.equal(isKqdDefect({ defect_code: 'KQD_DL' }), false);
  assert.equal(isKqdDefect({ defect_name: 'KQD' }), false);
});

test('exclude=true fixture returns actual=96 ttOk=90', () => {
  const result = calculateProductionOutput({
    ok: 90,
    defects: [
      { defect_code: 'BAVIA', quantity: 6 },
      { defect_code: 'KQD', quantity: 4 }
    ],
    excludeKqdFromTt: true
  });
  assert.deepEqual(result, { totalNg: 10, countedNg: 6, excludedKqd: 4, actualOutput: 96, ttOk: 90 });
});

test('exclude=false fixture returns actual=100 ttOk=90', () => {
  const result = calculateProductionOutput({
    ok: 90,
    defects: [
      { defect_code: 'BAVIA', quantity: 6 },
      { defect_code: 'KQD', quantity: 4 }
    ],
    excludeKqdFromTt: false
  });
  assert.deepEqual(result, { totalNg: 10, countedNg: 10, excludedKqd: 0, actualOutput: 100, ttOk: 90 });
});

test('temp/approved edit shared recalculation preserves ttOk instead of actual-totalNg corruption', () => {
  const result = recalculateReportOutput({
    ttOk: 90,
    defects: [
      { defect_code: 'BAVIA', quantity: 6 },
      { defect_code: 'KQD', quantity: 4 }
    ],
    excludeKqdFromTtSnapshot: 1
  });
  assert.equal(result.actualOutput, 96);
  assert.equal(result.ttOk, 90);
  assert.equal(result.totalNg, 10);
  assert.notEqual(result.actualOutput - result.totalNg, result.ttOk);
});

test('legacy null policy snapshot fails explicitly', () => {
  assert.throws(
    () => recalculateReportOutput({ ttOk: 90, defects: [], excludeKqdFromTtSnapshot: null }),
    (error) => error.code === 'KQD_POLICY_SNAPSHOT_MISSING'
  );
});

test('historical policy snapshot consistency is checked against historical resolver output', () => {
  assert.equal(assertKqdPolicySnapshotConsistency({ resolved: { excludeKqdFromTt: 1 }, snapshot: 1 }), true);
  assert.throws(
    () => assertKqdPolicySnapshotConsistency({ resolved: { excludeKqdFromTt: 0 }, snapshot: 1 }),
    (error) => error.code === 'KQD_POLICY_SNAPSHOT_MISMATCH'
  );
});

test('active production paths do not use KQD prefix/name authority', () => {
  const files = [
    '../utils/outputCalculation.js',
    '../domain/productionCalculationEngine.cjs',
    '../services/machineLineValidationService.js',
    '../services/machinePerformanceService.js',
    '../../frontend/src/pages/worker/processFormUtils.ts'
  ];
  for (const relative of files) {
    const source = fs.readFileSync(path.join(__dirname, relative), 'utf8');
    assert.doesNotMatch(source, /startsWith\(['\"]KQD/);
    assert.doesNotMatch(source, /includes\(['\"]KQD/);
    assert.doesNotMatch(source, /name\.includes\([^\n]*KQD/);
  }
});

test('temp and approved edit paths call canonical KQD report recalculation', () => {
  const temp = fs.readFileSync(path.join(__dirname, '../models/productionTempUpdateModel.js'), 'utf8');
  const approved = fs.readFileSync(path.join(__dirname, '../services/approvedReportEditService.js'), 'utf8');
  assert.match(temp, /recalculateReportOutput/);
  assert.doesNotMatch(temp, /actualOutput\s*-\s*detailValues\.tt_ng/);
  assert.match(approved, /recalculateReportOutput/);
  assert.match(approved, /exclude_kqd_from_tt_snapshot/);
  assert.doesNotMatch(approved, /before\.exclude_kqd_from_tt\b/);
});


test('historical KQD policy snapshot wins over mutable legacy/current policy', () => {
  const metrics = calculateProductionMetrics({
    tt_ok: 90,
    tt_ng: 10,
    actual_output: 96,
    actual_time: 1,
    total_time: 1,
    deduction_time: 0,
    standard_output: 100,
    training_percent_snapshot: 100,
    exclude_kqd_from_tt_snapshot: 1,
    exclude_kqd_from_tt: 0,
    defects: [
      { defect_code: 'BAVIA', quantity: 6 },
      { defect_code: 'KQD', quantity: 4 }
    ]
  }, { output_formula: 'OK_PLUS_NG', apply_training_percent: 0 });
  assert.equal(metrics.countedNg, 6);
  assert.equal(metrics.excludedKqd, 4);
  assert.equal(metrics.enteredOutput, 96);
});

test('supported historical Excel paths prefer report KQD snapshot over current product master', () => {
  const files = [
    '../services/processExcelExportService.js',
    '../services/monthlyExcelService.js',
    '../services/consolidatedExcelExportService.js',
    '../services/companyExcelExportService.js',
    '../services/googleSheetService.js'
  ];
  for (const relative of files) {
    const source = fs.readFileSync(path.join(__dirname, relative), 'utf8');
    assert.match(source, /exclude_kqd_from_tt_snapshot/);
  }
  const monthly = fs.readFileSync(path.join(__dirname, '../services/monthlyExcelService.js'), 'utf8');
  assert.doesNotMatch(monthly, /LEFT JOIN product_standards AS ps/);
});


test('Excel apply cannot mutate KQD snapshot directly and server create/edit preserve authoritative policy', () => {
  const excelContract = fs.readFileSync(path.join(__dirname, '../../shared/excelSyncContract.cjs'), 'utf8');
  const excelCreate = fs.readFileSync(path.join(__dirname, '../services/approvedReportExcelCreateService.js'), 'utf8');
  const approvedEdit = fs.readFileSync(path.join(__dirname, '../services/approvedReportEditService.js'), 'utf8');
  assert.doesNotMatch(excelContract, /['"]exclude_kqd_from_tt_snapshot['"]/);
  assert.match(excelCreate, /exclude_kqd_from_tt_snapshot:parentKqdPolicySnapshot/);
  assert.match(approvedEdit, /delete normalizedPatch\.exclude_kqd_from_tt_snapshot/);
  assert.match(approvedEdit, /before\.exclude_kqd_from_tt_snapshot/);
});
