'use strict';
// warmUp() batches the per-machine-line lookups of one report. It must change only the number of
// round trips, never the resolved standard or the business errors.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createStandardResolver } = require('../services/standardResolutionService');

function makeQuery({ aliases = [], machineStandards = [] } = {}) {
  const calls = [];
  const machines = [
    { id: 10, machine_code: 'M05', gc_work_type: 'CUT', process_code: 'GC' },
    { id: 11, machine_code: 'M06', gc_work_type: 'LONG', process_code: 'GC' },
  ];
  const query = async (rawSql, params = []) => {
    const sql = String(rawSql).replace(/\s+/g, ' ');
    calls.push(sql);
    if (/FROM machines m JOIN processes p/.test(sql)) {
      const codes = params.filter((p) => typeof p === 'string').map((p) => p.toUpperCase());
      const ids = params.filter((p, i) => i > 0 && typeof p === 'number');
      return machines.filter((m) => codes.includes(m.machine_code) || ids.includes(m.id));
    }
    if (/FROM product_aliases/.test(sql)) {
      const wanted = params.slice(1).map((p) => String(p).trim());
      return aliases.filter((a) => wanted.includes(a.alias_code));
    }
    if (/FROM product_machine_standards/.test(sql)) return machineStandards.filter((row) => params.slice(1).includes(row.machine_id) && params.slice(1).includes(row.product_code));
    if (/FROM product_standards ps WHERE/.test(sql)) {
      const code = String(params[1]);
      return ['P-AUTO', 'CANON'].includes(code) ? [{ product_standard_id: 3, product_code: code, encoding_code: null, work_type: 'Cắt', standard_output: 400, exclude_kqd_from_tt: 0 }] : [];
    }
    if (/FROM product_standard_versions/.test(sql)) return [{ id: 9, process_id: 1, product_code: params[1], standard_output: 400, exclude_kqd_from_tt: 0, version_no: 1, effective_from: '2026-01-01', effective_to: null, status: 'active' }];
    return [];
  };
  return { query, calls };
}

const lineArgs = (machineCode, machineId, productCode) => ({ processId: 1, productCode, machineId, machineCode, workDate: '2026-10-19' });
const items = [{ machineId: 10, machineCode: 'M05', productCode: 'P-AUTO' }, { machineId: 11, machineCode: 'M06', productCode: 'ALIAS-1' }];

async function resolveAll(resolver, warm) {
  if (warm) await resolver.warmUp({ processId: 1, workDate: '2026-10-19', items });
  const out = [];
  for (const item of items) {
    try { out.push(await resolver.resolveStandard(lineArgs(item.machineCode, item.machineId, item.productCode))); }
    catch (error) { out.push({ error: error.code }); }
  }
  return out;
}

test('warmUp returns the same standards as per-line queries (product fallback and alias)', async () => {
  const data = { aliases: [{ alias_code: 'ALIAS-1', product_code: 'CANON' }] };
  const cold = makeQuery(data); const warm = makeQuery(data);
  const a = await resolveAll(createStandardResolver({ query: cold.query }), false);
  const b = await resolveAll(createStandardResolver({ query: warm.query }), true);
  assert.deepEqual(b, a);
  assert.ok(warm.calls.length < cold.calls.length, `warm ${warm.calls.length} vs cold ${cold.calls.length}`);
  assert.equal(warm.calls.filter((s) => /FROM machines m JOIN processes p/.test(s)).length, 1);
  assert.equal(warm.calls.filter((s) => /FROM product_machine_standards/.test(s)).length, 1);
});

test('warmUp returns the same machine-specific standard as per-line queries', async () => {
  const data = {
    aliases: [{ alias_code: 'ALIAS-1', product_code: 'CANON' }],
    machineStandards: [{ id: 77, process_id: 1, product_code: 'CANON', machine_id: 11, standard_output: 900, calculated_output_per_hour: null, standard_time_seconds: 4, effective_from: null, effective_to: null, is_active: 1 }],
  };
  const cold = makeQuery(data); const warm = makeQuery(data);
  const a = await resolveAll(createStandardResolver({ query: cold.query }), false);
  const b = await resolveAll(createStandardResolver({ query: warm.query }), true);
  assert.deepEqual(b, a);
  assert.equal(b[1].machineStandardId, 77);
  assert.equal(b[1].standardOutput, 900);
});

test('warmUp keeps the alias conflict error', async () => {
  const data = { aliases: [{ alias_code: 'ALIAS-1', product_code: 'CANON' }, { alias_code: 'ALIAS-1', product_code: 'OTHER' }] };
  const a = await resolveAll(createStandardResolver({ query: makeQuery(data).query }), false);
  const b = await resolveAll(createStandardResolver({ query: makeQuery(data).query }), true);
  assert.deepEqual(b, a);
  assert.equal(b[1].error, 'PRODUCT_ALIAS_CONFLICT');
});

test('an unknown machine is still MACHINE_NOT_FOUND after warmUp, and no other product standard is borrowed', async () => {
  const { query } = makeQuery();
  const resolver = createStandardResolver({ query });
  await resolver.warmUp({ processId: 1, workDate: '2026-10-19', items: [{ machineId: 99, machineCode: 'NOPE', productCode: 'P-AUTO' }] });
  await assert.rejects(() => resolver.resolveStandard(lineArgs('NOPE', 99, 'P-AUTO')), (e) => e.code === 'MACHINE_NOT_FOUND');
  await assert.rejects(() => resolver.resolveStandard(lineArgs('M05', 10, 'UNKNOWN-PRODUCT')), (e) => e.code === 'HISTORICAL_STANDARD_NOT_FOUND');
});
