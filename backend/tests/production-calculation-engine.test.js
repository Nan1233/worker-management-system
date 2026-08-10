const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calculateProductionMetrics,
  normalizeTrainingPercent
} = require('../domain/productionCalculationEngine.cjs');

const DEFAULT = {
  apply_training_percent: 1,
  output_formula: 'ENTERED_X_TRAINING',
  output_per_hour_formula: 'ADJUSTED_OUTPUT_DIV_ACTUAL_TIME',
  achievement_formula: 'OUTPUT_PER_HOUR_DIV_STANDARD',
  ng_rate_formula: 'NG_DIV_OK_PLUS_NG',
  actual_time_formula: 'DATABASE_SNAPSHOT'
};

test('zero training stays zero across adjusted output, SP/h and achievement', () => {
  const metrics = calculateProductionMetrics({
    training_percent: 0,
    total_time: 8,
    actual_time: 7.5,
    deduction_time: 0.5,
    standard_output: 100,
    actual_output: 600,
    tt_ok: 590,
    tt_ng: 10
  }, DEFAULT);

  assert.equal(normalizeTrainingPercent(0), 0);
  assert.equal(metrics.trainingFactor, 0);
  assert.equal(metrics.adjustedOutput, 0);
  assert.equal(metrics.outputPerHour, 0);
  assert.equal(metrics.achievement, 0);
  assert.equal(metrics.ngRate, 10 / 600);
});

test('missing training defaults to 100 percent, not zero', () => {
  const metrics = calculateProductionMetrics({
    training_percent: null,
    actual_time: 2,
    standard_output: 100,
    actual_output: 180,
    tt_ok: 175,
    tt_ng: 5
  }, DEFAULT);

  assert.equal(metrics.trainingPercent, 100);
  assert.equal(metrics.adjustedOutput, 180);
  assert.equal(metrics.outputPerHour, 90);
  assert.equal(metrics.achievement, 0.9);
});

test('KQD is excluded only when product rule says so', () => {
  const report = {
    training_percent: 100,
    actual_time: 1,
    standard_output: 100,
    actual_output: null,
    tt_ok: 90,
    tt_ng: 10,
    defects: [
      { defect_type_code: 'KQD', quantity: 4 },
      { defect_type_code: 'RACH', quantity: 6 }
    ]
  };

  const included = calculateProductionMetrics({ ...report, exclude_kqd_from_tt: 0 }, {
    ...DEFAULT,
    output_formula: 'OK_PLUS_NG'
  });
  const excluded = calculateProductionMetrics({ ...report, exclude_kqd_from_tt: 1 }, {
    ...DEFAULT,
    output_formula: 'OK_PLUS_NG'
  });

  assert.equal(included.allNg, 10);
  assert.equal(included.countedNg, 10);
  assert.equal(included.adjustedOutput, 100);
  assert.equal(excluded.allNg, 10);
  assert.equal(excluded.countedNg, 6);
  assert.equal(excluded.excludedKqd, 4);
  assert.equal(excluded.adjustedOutput, 96);
  assert.equal(excluded.ngRate, 0.1, 'NG rate still uses all physical NG by configured denominator');
});

test('actual time formula supports working minus deduction and machine line sum', () => {
  const base = {
    training_percent: 100,
    total_time: 8,
    deduction_time: 1.5,
    actual_time: 8,
    actual_output: 650,
    standard_output: 100,
    tt_ok: 650,
    tt_ng: 0,
    machineLines: [{ hours: 2 }, { hours: 3.25 }]
  };

  const workMinus = calculateProductionMetrics(base, { ...DEFAULT, actual_time_formula: 'WORKING_MINUS_DEDUCTION' });
  const machineSum = calculateProductionMetrics(base, { ...DEFAULT, actual_time_formula: 'MACHINE_LINES_SUM' });
  assert.equal(workMinus.actualTime, 6.5);
  assert.equal(machineSum.actualTime, 5.25);
});

test('machine performance snapshot remains authoritative for multi-machine reports', () => {
  const metrics = calculateProductionMetrics({
    training_percent: 50,
    actual_time: 2.5,
    actual_output: 999,
    standard_output: 100,
    tt_ok: 200,
    tt_ng: 10,
    machinePerformance: {
      machine_count: 2,
      counted_output: 230,
      maximum_output: 250
    }
  }, DEFAULT);

  assert.equal(metrics.hasMachinePerformance, true);
  assert.equal(metrics.adjustedOutput, 230);
  assert.equal(metrics.plannedOutput, 250);
  assert.equal(metrics.achievement, 0.92);
});
