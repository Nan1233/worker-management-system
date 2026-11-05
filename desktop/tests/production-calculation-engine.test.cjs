const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../electron/productionCalculationEngine.cjs');

// Regression: 7d2fe072 deleted normalizeCode while calculateProductionMetrics
// still called it, so every Desktop metric computation threw ReferenceError.
test('calculateProductionMetrics runs for ordinary reports (no ReferenceError)', () => {
  const metrics = engine.calculateProductionMetrics({
    process_code: 'CAN', operation_mode: 'MANUAL', total_time: 8, deduction_time: 0, actual_time: 8,
    tt_ok: 100, tt_ng: 5, actual_output: 105, standard_output: 10, training_percent_snapshot: 100,
    defects: [{ defect_code: 'KQD', quantity: 3 }, { defect_code: 'BAVIA', quantity: 2 }]
  });
  assert.ok(metrics && typeof metrics === 'object');
});

test('process and operation codes are compared case-insensitively for the GC machine branch', () => {
  const line = { machine_time_hours: 4, deduction_time_hours: 0, ok_quantity: 80, ng_quantity: 0, standard_output: 20, defects: [] };
  const upper = engine.calculateProductionMetrics({ process_code: 'GC', operation_mode: 'MACHINE', training_percent_snapshot: 100, machineLines: [line] });
  const lower = engine.calculateProductionMetrics({ process_code: ' gc ', operation_mode: 'machine', training_percent_snapshot: 100, machineLines: [line] });
  assert.deepEqual(lower, upper);
});

test('KQD is ordinary NG in Desktop metrics; a legacy exclude flag has no effect', () => {
  const base = {
    process_code: 'CAN', operation_mode: 'MANUAL', total_time: 8, deduction_time: 0, actual_time: 8,
    tt_ok: 100, tt_ng: 5, actual_output: 105, standard_output: 10, training_percent_snapshot: 100,
    defects: [{ defect_code: 'KQD', quantity: 3 }, { defect_code: 'BAVIA', quantity: 2 }]
  };
  const plain = engine.calculateProductionMetrics(base);
  const flagged = engine.calculateProductionMetrics({ ...base, exclude_kqd_from_tt_snapshot: 1, exclude_kqd_from_tt: 1 });
  assert.deepEqual(flagged, plain);
  assert.equal(engine.calculateNg(base).countedNg, 5, 'KQD 3 + BAVIA 2 are all counted');
  assert.equal(engine.calculateNg(base).allNg, 5);
});
