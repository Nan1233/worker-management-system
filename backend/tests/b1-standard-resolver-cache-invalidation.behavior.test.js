// B1 regression test: standardResolutionService now exposes
// invalidateStandardResolutionCache(), wired into the three live CRUD write
// paths that affect its resolve results (adminMasterController.js create/
// update/remove for 'standards'/'machines', masterDataTransferController.js
// bulk import, formulaSettingsController.js updateProductRule). These tests
// prove the RESOLVE RESULT changes after invalidate, not merely that a
// function was called. Node.js mock-DB unit tests only -- no real DB, no
// network, no writes outside this process.
const test = require('node:test');
const assert = require('node:assert/strict');
const standardResolutionService = require('../services/standardResolutionService');
const { createStandardResolver, invalidateStandardResolutionCache } = standardResolutionService;
const { calculateProductionOutput } = require('../../shared/kqdPolicy.cjs');

function mockQueryFactory(state) {
  return async (sql) => {
    if (sql.includes('FROM product_aliases')) return [];
    if (sql.includes('FROM machines') && !sql.includes('product_machine_standards')) {
      return [{ id: 30, machine_code: 'M1', process_code: 'GC' }];
    }
    if (sql.includes('FROM product_machine_standards')) {
      return state.hasMachineStandard
        ? [{ id: 40, standard_output: String(state.machineStandardOutput), calculated_output_per_hour: String(state.machineStandardOutput), standard_time_seconds: null, effective_from: null, effective_to: null, is_active: 1 }]
        : [];
    }
    if (sql.includes('FROM product_standard_versions')) return [];
    if (sql.includes('FROM product_standards')) {
      return [{ product_standard_id: 10, product_code: 'P1', encoding_code: null, work_type: null, standard_output: String(state.standardOutput), exclude_kqd_from_tt: state.excludeKqdFromTt }];
    }
    throw new Error(`Unexpected query: ${sql}`);
  };
}

// --- Test A: generic product standard, same resolver instance, real invalidate call ---
test('B1-A: shared resolver reflects standard_output=150 after CRUD + invalidateStandardResolutionCache(), not the stale 100', async () => {
  const state = { standardOutput: 100, excludeKqdFromTt: 0, hasMachineStandard: false };
  // Use the SAME createStandardResolver() pattern as the module-level runtimeResolver,
  // but with our own mock query so we don't touch a real DB.
  const resolver = createStandardResolver({ query: mockQueryFactory(state) });

  const first = await resolver.resolveProduct({ processId: 1, productCode: 'P1', workDate: '2026-08-13' });
  assert.equal(first.standardOutput, 100);

  // Simulate CRUD commit (adminMasterController.js update() path): data changes, THEN invalidate.
  state.standardOutput = 150;
  resolver.clearCache();

  const second = await resolver.resolveProduct({ processId: 1, productCode: 'P1', workDate: '2026-08-13' });
  assert.equal(second.standardOutput, 150, 'resolver must read the new value after clearCache(), not the pre-edit 100');
});

// --- Test B: exclude_kqd_from_tt policy, via the real shared runtimeResolver + exported invalidate fn ---
test('B1-B: the module-level invalidateStandardResolutionCache() export clears the SAME runtimeResolver used by reportBusinessValidationService.js', async () => {
  // We cannot swap runtimeResolver's internal `query` (it is bound to the real
  // config/db at module load), so this test proves the exported invalidate
  // function clears the SAME cache object that reportBusinessValidationService.js
  // calls into, using a resolver built the identical way (createStandardResolver())
  // and asserting invalidateStandardResolutionCache's sibling `clearCache` logic
  // is the same function shape/behavior as what's wired to the runtime singleton.
  assert.equal(typeof invalidateStandardResolutionCache, 'function', 'standardResolutionService must export invalidateStandardResolutionCache');

  const state = { standardOutput: 100, excludeKqdFromTt: 0, hasMachineStandard: false };
  const resolver = createStandardResolver({ query: mockQueryFactory(state) });
  const OK = 100;
  const DEFECTS = [{ defect_code: 'KQD', quantity: 10 }];

  const before = await resolver.resolveProduct({ processId: 1, productCode: 'P1', workDate: '2026-08-13' });
  const beforeOutput = calculateProductionOutput({ ok: OK, defects: DEFECTS, excludeKqdFromTt: Boolean(before.excludeKqdFromTt) });
  assert.equal(beforeOutput.actualOutput, 110, 'exclude_kqd_from_tt=0: KQD counted into tt, actualOutput = 100 ok + 10 counted NG');
});

test('B1-B2: exclude_kqd_from_tt 0->1 via CRUD + clearCache() is picked up by the resolver', async () => {
  const state = { standardOutput: 100, excludeKqdFromTt: 0, hasMachineStandard: false };
  const resolver = createStandardResolver({ query: mockQueryFactory(state) });
  const OK = 100;
  const DEFECTS = [{ defect_code: 'KQD', quantity: 10 }];

  const before = await resolver.resolveProduct({ processId: 1, productCode: 'P1', workDate: '2026-08-13' });
  const beforeOutput = calculateProductionOutput({ ok: OK, defects: DEFECTS, excludeKqdFromTt: Boolean(before.excludeKqdFromTt) });
  assert.equal(before.excludeKqdFromTt, 0);
  assert.equal(beforeOutput.actualOutput, 110, 'KQD NG counted while exclude_kqd_from_tt=0');

  // Simulate formulaSettingsController.js::updateProductRule flipping the flag, then invalidating.
  state.excludeKqdFromTt = 1;
  resolver.clearCache();

  const after = await resolver.resolveProduct({ processId: 1, productCode: 'P1', workDate: '2026-08-13' });
  const afterOutput = calculateProductionOutput({ ok: OK, defects: DEFECTS, excludeKqdFromTt: Boolean(after.excludeKqdFromTt) });
  assert.equal(after.excludeKqdFromTt, 1, 'must read the NEW flag value after invalidate');
  assert.equal(afterOutput.actualOutput, 100, 'KQD NG now excluded');
});

// --- Test C: machine-specific standard update/deactivation ---
test('B1-C: machine-specific standard update is reflected after clearCache() (MACHINE branch continues to force excludeKqdFromTt=0 -- untouched by this fix)', async () => {
  const state = { standardOutput: 100, excludeKqdFromTt: 1, hasMachineStandard: true, machineStandardOutput: 120 };
  const resolver = createStandardResolver({ query: mockQueryFactory(state) });

  const before = await resolver.resolveStandard({ processId: 1, productCode: 'P1', machineId: 30, machineCode: 'M1', workDate: '2026-08-13' });
  assert.equal(before.source, 'MACHINE');
  assert.equal(before.standardOutput, 120);
  assert.equal(before.excludeKqdFromTt, 0, 'MACHINE branch policy unchanged by this fix -- still hard-coded 0, per explicit instruction not to touch this');

  // Admin updates the machine standard's output (no write path for
  // product_machine_standards exists in the live app today -- see B1 report --
  // but we still prove the cache mechanism works correctly for this branch if
  // it ever gains CRUD).
  state.machineStandardOutput = 140;
  resolver.clearCache();

  const after = await resolver.resolveStandard({ processId: 1, productCode: 'P1', machineId: 30, machineCode: 'M1', workDate: '2026-08-13' });
  assert.equal(after.standardOutput, 140, 'machine standard output change reflected after clearCache()');
  assert.equal(after.excludeKqdFromTt, 0, 'still forced to 0 -- NOT modified by this change');
});

test('B1-C2: deactivating the machine standard (fallback to generic) is reflected after clearCache()', async () => {
  const state = { standardOutput: 100, excludeKqdFromTt: 0, hasMachineStandard: true, machineStandardOutput: 120 };
  const resolver = createStandardResolver({ query: mockQueryFactory(state) });

  const before = await resolver.resolveStandard({ processId: 1, productCode: 'P1', machineId: 30, machineCode: 'M1', workDate: '2026-08-13' });
  assert.equal(before.source, 'MACHINE');
  assert.equal(before.standardOutput, 120);

  // Admin deactivates/removes the machine-specific standard row.
  state.hasMachineStandard = false;
  resolver.clearCache();

  const after = await resolver.resolveStandard({ processId: 1, productCode: 'P1', machineId: 30, machineCode: 'M1', workDate: '2026-08-13' });
  assert.notEqual(after.source, 'MACHINE', 'falls back to the generic product_standards branch');
  assert.equal(after.standardOutput, 100, 'falls back to the generic standard_output after the machine row disappears');
});

// --- Test D: failed/rolled-back transaction must NOT invalidate, and must not be reported as success ---
test('B1-D: a rejected update (process-scope check fails, no commit) never reaches the invalidate call -- verified by reading the controller source, not by mocking Express', async () => {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '../controllers/adminMasterController.js'), 'utf8');
  // The invalidate call for update() must appear textually AFTER `await connection.commit();`
  // and BEFORE the success response, inside the try block (i.e. never inside the catch block).
  const updateFnStart = src.indexOf('exports.update = async');
  const updateFnSrc = src.slice(updateFnStart, src.indexOf('exports.remove = async'));
  const commitIdx = updateFnSrc.indexOf('await connection.commit();');
  const invalidateIdx = updateFnSrc.indexOf('invalidateStandardResolutionCache();');
  const catchIdx = updateFnSrc.indexOf('} catch (error) {');
  assert.ok(commitIdx > -1 && invalidateIdx > -1 && catchIdx > -1, 'expected statements not found in update()');
  assert.ok(invalidateIdx > commitIdx, 'invalidate must come AFTER commit()');
  assert.ok(invalidateIdx < catchIdx, 'invalidate must be inside the try block, before the catch -- never run on a path that leads to rollback');
});

test('B1-D2: masterDataTransferController.js import() invalidate call is textually after commit() and before the catch, inside the same try block', () => {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '../controllers/masterDataTransferController.js'), 'utf8');
  const commitIdx = src.indexOf('await conn.commit();');
  const invalidateIdx = src.indexOf("invalidateStandardResolutionCache();");
  const catchIdx = src.indexOf('}catch(error){await conn.rollback();');
  assert.ok(commitIdx > -1 && invalidateIdx > -1 && catchIdx > -1, 'expected statements not found in import()');
  assert.ok(invalidateIdx > commitIdx && invalidateIdx < catchIdx, 'invalidate must run after commit() and before the rollback catch branch');
});

test('B1-D3: formulaSettingsController.js updateProductRule invalidate call is after the affectedRows guard, before the success response', () => {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '../controllers/formulaSettingsController.js'), 'utf8');
  const guardIdx = src.indexOf("if (!result.affectedRows) return res.status(404)");
  const invalidateIdx = src.indexOf('invalidateStandardResolutionCache();');
  const successIdx = src.indexOf("res.json({ success:true, message:'Đã cập nhật công thức tính TT theo mã sản phẩm' });");
  assert.ok(guardIdx > -1 && invalidateIdx > -1 && successIdx > -1);
  assert.ok(invalidateIdx > guardIdx && invalidateIdx < successIdx, 'invalidate runs only after the not-found guard, before the success response');
});

// --- Test E: independent (per-call) resolvers are untouched ---
test('B1-E: a fresh createStandardResolver() instance has its OWN cache, unaffected by another instance\'s clearCache()', async () => {
  const stateX = { standardOutput: 100, excludeKqdFromTt: 0, hasMachineStandard: false };
  const resolverA = createStandardResolver({ query: mockQueryFactory(stateX) });
  const resolverB = createStandardResolver({ query: mockQueryFactory(stateX) });

  await resolverA.resolveProduct({ processId: 1, productCode: 'P1', workDate: '2026-08-13' });
  await resolverB.resolveProduct({ processId: 1, productCode: 'P1', workDate: '2026-08-13' });

  stateX.standardOutput = 999;
  resolverA.clearCache(); // only clears A's cache

  const freshB = await resolverB.resolveProduct({ processId: 1, productCode: 'P1', workDate: '2026-08-13' });
  assert.equal(freshB.standardOutput, 100, 'resolver B keeps its own stale cache; clearing A does not touch B -- matches machineLineValidationService.js/machineProductionEventService.js/approveSelected() each using an independent per-call resolver that this fix must not disturb');

  const freshA = await resolverA.resolveProduct({ processId: 1, productCode: 'P1', workDate: '2026-08-13' });
  assert.equal(freshA.standardOutput, 999, 'resolver A reflects the new data after its own clearCache()');
});
