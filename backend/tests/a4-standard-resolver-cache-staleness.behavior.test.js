// A4 regression test: standardResolutionService resolver cache can serve a
// stale standard_output/exclude_kqd_from_tt after the underlying master data
// (product_standards / product_standard_versions / product_machine_standards)
// changes, as long as the SAME resolver instance (same productCache/standardCache
// Map) is reused. Node.js in-process unit test using a mock `query` function —
// does NOT touch any real DB, does NOT prove Cloudflare Workers runtime
// behavior directly (see note at bottom of file).
const test = require('node:test');
const assert = require('node:assert/strict');
const { createStandardResolver } = require('../services/standardResolutionService');

function makeMockQuery(state) {
  return async (sql) => {
    if (sql.includes('FROM product_aliases')) return [];
    if (sql.includes('FROM product_machine_standards')) return [];
    if (sql.includes('FROM product_standard_versions')) return [];
    if (sql.includes('FROM product_standards')) {
      return [{
        product_standard_id: 10,
        product_code: 'P1',
        encoding_code: null,
        work_type: null,
        standard_output: state.standardOutput,
        exclude_kqd_from_tt: state.excludeKqdFromTt
      }];
    }
    throw new Error(`Unexpected query: ${sql}`);
  };
}

test('A4-cache: same resolver instance returns STALE standardOutput/excludeKqdFromTt after master data changes (reproduces reportBusinessValidationService.js sharing the module-level runtimeResolver)', async () => {
  const state = { standardOutput: '100', excludeKqdFromTt: 0 };
  const resolver = createStandardResolver({ query: makeMockQuery(state) });
  const input = { processId: 1, productCode: 'P1', workDate: '2026-08-13' };

  const first = await resolver.resolveProduct(input);
  assert.equal(first.standardOutput, 100);
  assert.equal(first.excludeKqdFromTt, 0);

  // Simulate an admin editing product_standards (standard_output 100->150,
  // exclude_kqd_from_tt 0->1) via the normal CRUD flow.
  state.standardOutput = '150';
  state.excludeKqdFromTt = 1;

  const second = await resolver.resolveProduct(input);
  assert.equal(second.standardOutput, 100, 'EXPECTED (current code): cache still serves pre-edit standardOutput');
  assert.equal(second.excludeKqdFromTt, 0, 'EXPECTED (current code): cache still serves pre-edit excludeKqdFromTt');
  assert.deepEqual(second, first, 'cached object is literally the same as before the edit');
});

test('A4-cache: a FRESH resolver instance (new createStandardResolver() call) sees the updated data immediately', async () => {
  const state = { standardOutput: '100', excludeKqdFromTt: 0 };
  const input = { processId: 1, productCode: 'P1', workDate: '2026-08-13' };

  const resolverBeforeEdit = createStandardResolver({ query: makeMockQuery(state) });
  const before = await resolverBeforeEdit.resolveProduct(input);
  assert.equal(before.standardOutput, 100);

  state.standardOutput = '150';
  state.excludeKqdFromTt = 1;

  const resolverAfterEdit = createStandardResolver({ query: makeMockQuery(state) });
  const after = await resolverAfterEdit.resolveProduct(input);
  assert.equal(after.standardOutput, 150, 'a fresh resolver instance always reflects current data');
  assert.equal(after.excludeKqdFromTt, 1);
});

test('A4-cache: resolveStandard() (not just resolveProduct()) exhibits the same staleness for the generic (non-machine) branch', async () => {
  const state = { standardOutput: '100', excludeKqdFromTt: 0 };
  const resolver = createStandardResolver({ query: makeMockQuery(state) });
  const input = { processId: 1, productCode: 'P1', workDate: '2026-08-13' };

  const first = await resolver.resolveStandard(input);
  assert.equal(first.standardOutput, 100);

  state.standardOutput = '999';
  state.excludeKqdFromTt = 1;

  const second = await resolver.resolveStandard(input);
  assert.equal(second.standardOutput, 100, 'resolveStandard() delegates to the same cached resolveProduct() path and is equally stale');
});

/*
 * Cloudflare Workers vs Node.js — do not assume equal cache lifetime:
 * - Node.js long-running process (production/Render): module-level
 *   `runtimeResolver` (services/standardResolutionService.js, created once at
 *   require() time) keeps its Map caches alive for the WHOLE process
 *   lifetime; nothing anywhere calls .clear() on them (grep-confirmed).
 *   Staleness window: unbounded until restart/redeploy.
 * - Cloudflare Workers (TEST): the module scope persists only for the warm
 *   isolate's lifetime (commonly seconds-minutes; evicted on redeploy, idle
 *   timeout, or scale-out). Staleness window: real but bounded and
 *   non-deterministic; cannot be measured by a mock unit test. Verifying the
 *   exact magnitude on TEST requires a live write (edit a standard, then
 *   immediately create a report) which this phase was told NOT to do without
 *   permission. Marked BLOCKED for the Cloudflare-specific magnitude only —
 *   the underlying shared-Map-never-cleared mechanism is PROVEN above for any
 *   runtime that keeps the module warm across requests.
 */
