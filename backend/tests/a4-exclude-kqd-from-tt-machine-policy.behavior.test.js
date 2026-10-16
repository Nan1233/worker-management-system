// A4 regression test: exclude_kqd_from_tt policy matrix across generic
// product standard vs machine-specific standard (product_machine_standards),
// computed with the REAL calculateProductionOutput formula from
// shared/kqdPolicy.cjs. Example data: ok=100, one NG line with defect_code
// 'KQD' qty=10, as requested in A4 section 3. Node.js mock-DB unit test only.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createStandardResolver } = require('../services/standardResolutionService');
const { calculateProductionOutput } = require('../../shared/kqdPolicy.cjs');

const OK = 100;
const DEFECTS = [{ defect_code: 'KQD', quantity: 10 }];

function mockQuery({ genericExclude, hasMachineStandard }) {
  return async (sql, params = []) => {
    if (sql.includes('FROM product_aliases')) return [];
    if (sql.includes('FROM machines') && !sql.includes('product_machine_standards')) {
      return [{ id: 30, machine_code: 'M1', process_code: 'GC' }];
    }
    if (sql.includes('FROM product_machine_standards')) {
      return hasMachineStandard
        ? [{ id: 40, standard_output: '120', calculated_output_per_hour: '120', standard_time_seconds: null, effective_from: null, effective_to: null, is_active: 1 }]
        : [];
    }
    if (sql.includes('FROM product_standard_versions')) return [];
    if (sql.includes('FROM product_standards')) {
      return [{ product_standard_id: 10, product_code: 'P1', encoding_code: null, work_type: null, standard_output: '100', exclude_kqd_from_tt: genericExclude ? 1 : 0 }];
    }
    throw new Error(`Unexpected query: ${sql}`);
  };
}

async function resolveAndCompute({ genericExclude, hasMachineStandard, withMachine }) {
  const resolver = createStandardResolver({ query: mockQuery({ genericExclude, hasMachineStandard }) });
  const resolved = await resolver.resolveStandard({
    processId: 1,
    productCode: 'P1',
    machineId: withMachine ? 30 : null,
    machineCode: withMachine ? 'M1' : null,
    workDate: '2026-08-13'
  });
  const output = calculateProductionOutput({ ok: OK, defects: DEFECTS, excludeKqdFromTt: Boolean(resolved.excludeKqdFromTt) });
  return { resolved, output };
}

test('Row 1 — generic standard, exclude_kqd_from_tt=0, no machine standard: KQD counted into tt', async () => {
  const { resolved, output } = await resolveAndCompute({ genericExclude: false, hasMachineStandard: false, withMachine: false });
  assert.equal(resolved.source, 'LEGACY_PRODUCT_STANDARD_PROCESS_FALLBACK');
  assert.equal(resolved.excludeKqdFromTt, 0);
  assert.equal(output.countedNg, 10, 'KQD NG is counted (not excluded)');
  assert.equal(output.actualOutput, 110);
});

test('Row 2 — generic standard, exclude_kqd_from_tt=1, no machine standard: KQD excluded from tt', async () => {
  const { resolved, output } = await resolveAndCompute({ genericExclude: true, hasMachineStandard: false, withMachine: false });
  assert.equal(resolved.excludeKqdFromTt, 1);
  assert.equal(output.countedNg, 0, 'KQD NG is excluded');
  assert.equal(output.actualOutput, 100);
});

test('Row 3 — generic exclude_kqd_from_tt=0 + machine standard exists: MACHINE branch forces excludeKqdFromTt=0 (same result as row 1, consistent but not tested against generic=1 case)', async () => {
  const { resolved, output } = await resolveAndCompute({ genericExclude: false, hasMachineStandard: true, withMachine: true });
  assert.equal(resolved.source, 'MACHINE');
  assert.equal(resolved.excludeKqdFromTt, 0, 'PROVEN: MACHINE branch hard-codes excludeKqdFromTt=0 regardless of generic flag');
  assert.equal(output.countedNg, 10);
  assert.equal(output.actualOutput, 110);
});

test('Row 4 — generic exclude_kqd_from_tt=1 + machine standard exists: MACHINE branch STILL forces excludeKqdFromTt=0, silently overriding the generic policy', async () => {
  const { resolved, output } = await resolveAndCompute({ genericExclude: true, hasMachineStandard: true, withMachine: true });
  assert.equal(resolved.source, 'MACHINE');
  // This is the core A2/A3 finding, now proven by a running test:
  // the generic product's exclude_kqd_from_tt=1 is IGNORED here.
  assert.equal(resolved.excludeKqdFromTt, 0, 'PROVEN BUG CANDIDATE: generic exclude_kqd_from_tt=1 is silently ignored when a machine standard row exists');
  assert.equal(output.countedNg, 10, 'KQD NG is counted into tt here, even though the product is flagged to exclude KQD');
  assert.equal(output.actualOutput, 110, 'differs from Row 2 (actualOutput=100) for the SAME product/NG, only because a machine-standard row exists');
  // Side-by-side with Row 2 to make the discrepancy explicit in one assertion:
  const rowTwo = await resolveAndCompute({ genericExclude: true, hasMachineStandard: false, withMachine: false });
  assert.notEqual(output.actualOutput, rowTwo.output.actualOutput, 'same product, same NG, same exclude_kqd_from_tt=1 intent -> different actualOutput depending only on presence of a machine-standard row');
});

test('Row 5 — historical version + machine standard both exist: MACHINE branch takes priority, version/exclude_kqd_from_tt from the version is never consulted', async () => {
  const query = async (sql) => {
    if (sql.includes('FROM product_aliases')) return [];
    if (sql.includes('FROM machines') && !sql.includes('product_machine_standards')) return [{ id: 30, machine_code: 'M1', process_code: 'GC' }];
    if (sql.includes('FROM product_machine_standards')) {
      return [{ id: 40, standard_output: '120', calculated_output_per_hour: '120', standard_time_seconds: null, effective_from: null, effective_to: null, is_active: 1 }];
    }
    if (sql.includes('FROM product_standard_versions')) {
      // Would have exclude_kqd_from_tt=1 if ever reached.
      return [{ id: 20, process_id: 1, product_code: 'P1', standard_output: '200', exclude_kqd_from_tt: 1, version_no: 2, effective_from: '2026-01-01', effective_to: null }];
    }
    if (sql.includes('FROM product_standards')) return [{ product_standard_id: 10, product_code: 'P1', encoding_code: null, work_type: null, standard_output: '100', exclude_kqd_from_tt: 1 }];
    throw new Error(`Unexpected query: ${sql}`);
  };
  const resolver = createStandardResolver({ query });
  const resolved = await resolver.resolveStandard({ processId: 1, productCode: 'P1', machineId: 30, machineCode: 'M1', workDate: '2026-08-13' });
  assert.equal(resolved.source, 'MACHINE', 'priority order proven: product_machine_standards wins over product_standard_versions/product_standards entirely');
  assert.equal(resolved.standardOutput, 120, 'machine standard_output (120) used, not the version (200) or generic (100)');
  assert.equal(resolved.excludeKqdFromTt, 0, 'version exclude_kqd_from_tt=1 is never read in this branch');
});

test('Row 6 — snapshot changed between create and approval: assertKqdPolicySnapshotConsistency blocks approval instead of silently approving mismatched data', async () => {
  const { assertStandardSnapshotConsistency } = require('../services/standardResolutionService');
  const { businessError } = require('../services/standardResolutionService');
  void assertStandardSnapshotConsistency; void businessError;
  const kqdSnap = require('../services/kqdPolicySnapshotService');
  // Simulate: report was created/edited when resolved.excludeKqdFromTt was 1
  // (snapshot stored = 1), but by approval time the master data changed so
  // resolve() now returns 0.
  assert.throws(
    () => kqdSnap.assertKqdPolicySnapshotConsistency({ resolved: { excludeKqdFromTt: 0, nonProductWork: false }, snapshot: 1 }),
    (err) => err.code === 'KQD_POLICY_SNAPSHOT_MISMATCH',
    'approval-time re-resolve mismatch is REJECTED (throws), not silently approved'
  );
  // And confirms the matching case does NOT throw.
  assert.doesNotThrow(() => kqdSnap.assertKqdPolicySnapshotConsistency({ resolved: { excludeKqdFromTt: 1, nonProductWork: false }, snapshot: 1 }));
});
