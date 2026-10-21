const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Isolated: db stubbed, nothing leaves this process.
const dbPath = require.resolve('../config/db');
function rows(sql) {
  const t = String(sql).replace(/\s+/g, ' ').toLowerCase();
  if (t.includes('from processes')) return [{ process_code: 'GC' }];
  if (t.includes('from product_aliases') || t.includes('from product_machine_standards') || t.includes('from product_standard_versions')) return [];
  if (t.includes('from product_standards')) {
    if (t.includes("in ('lồng','long')")) return [{ product_standard_id: 1, product_code: '15U-L', encoding_code: null, work_type: 'Lồng', standard_output: 200, exclude_kqd_from_tt: 0 }];
    return [];
  }
  return [];
}
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
  query(sql, params, cb) { const done = typeof params === 'function' ? params : cb; done(null, rows(sql)); },
  promise() { return { query: async (sql) => [rows(sql)] }; }
} };
const { validateManualOutputCeiling } = require('../controllers/productionTempController');
const { explicitGcWorkType } = require('../utils/gcMachineWorkType');

const body = { process_id: 1, process_code: 'GC', product_name: '15U-L', operation_mode: 'MANUAL', work_date: '2026-10-07', actual_time: 2.5, tt_ok: 100 };
const mkRes = () => ({ code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } });
const run = async (over) => { const res = mkRes(); const ok = await validateManualOutputCeiling({ body: { ...body, ...over } }, res); return { ok, res }; };

test('manual GC Lồng without a machine passes the output-ceiling resolver (the reported POST /production-temp failure)', async () => {
  const { ok } = await run({ operation_type: 'NEST' });
  assert.equal(ok, true);
});

test('LONG / Lồng spellings are accepted; over-200% output is still rejected (ceiling rule unchanged)', async () => {
  assert.equal((await run({ operation_type: 'LONG' })).ok, true);
  const over = await run({ operation_type: 'NEST', tt_ok: 5000 });
  assert.equal(over.ok, false);
  assert.equal(over.res.code, 422);
  assert.equal(over.res.body.code, 'OUTPUT_OVER_200_PERCENT');
});

test('manual GC without any work type still fails closed (no guessing)', async () => {
  await assert.rejects(run({ operation_type: null }), (e) => e.code === 'GC_WORK_TYPE_UNRESOLVED');
});

test('manual GC Cắt looks up the Cắt standard, not Lồng (none in this fixture: fails closed)', async () => {
  await assert.rejects(run({ operation_type: 'CUT' }), (e) => e.code === 'HISTORICAL_STANDARD_NOT_FOUND');
});

test('explicitGcWorkType never returns a type for non-GC processes', () => {
  assert.equal(explicitGcWorkType({ isGc: false, operationType: 'NEST' }), null);
  assert.equal(explicitGcWorkType({ isGc: true, operationType: 'NEST' }), 'Lồng');
  assert.equal(explicitGcWorkType({ isGc: true, operationType: 'CUT' }), 'Cắt');
  assert.equal(explicitGcWorkType({ isGc: true, operationType: 'x' }), null);
});

test('approval re-resolution of a manual GC report passes the saved work type', () => {
  const src = fs.readFileSync(path.join(__dirname, '../models/productionTempApprovalModel.js'), 'utf8');
  assert.match(src, /workType: explicitGcWorkType\(\{ isGc: Number\(item\.process_id\) === 1, operationType: item\.operation_type \}\)/);
});
