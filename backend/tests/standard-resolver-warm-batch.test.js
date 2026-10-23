'use strict';
// warmUp() now also batches product_standards + product_standard_versions. The fake below implements the SQL
// semantics of the per-line queries (exact code, status, stored work-type spellings, ORDER BY id LIMIT 2, effective
// range) so that cold (per-line SQL) and warm (batched, filtered in memory) resolution can be compared field by field.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createStandardResolver } = require('../services/standardResolutionService');

const WORK_DATE = '2026-10-19';
const machines = [
  { id: 10, machine_code: 'M05', gc_work_type: 'CUT', process_code: 'GC' },
  { id: 11, machine_code: 'M06', gc_work_type: 'LONG', process_code: 'GC' },
];
function makeQuery({ standards, versions }) {
  const calls = [];
  const trim = (v) => String(v ?? '').replace(/^ +| +$/g, '');
  const inList = (sql, key) => /LỒNG/.test(sql) ? ['LỒNG', 'LONG'] : /CẮT/.test(sql) ? ['CẮT', 'CAT', 'CUT'] : null;
  const query = async (rawSql, params = []) => {
    const sql = String(rawSql).replace(/\s+/g, ' ');
    calls.push(sql);
    if (/FROM machines m JOIN processes p/.test(sql)) {
      const codes = params.filter((p) => typeof p === 'string').map((p) => p.toUpperCase());
      const ids = params.filter((p, i) => i > 0 && typeof p === 'number');
      return machines.filter((m) => codes.includes(m.machine_code) || ids.includes(m.id));
    }
    if (/FROM product_aliases/.test(sql)) return [];
    if (/FROM product_machine_standards/.test(sql)) return [];
    if (/FROM product_standards ps WHERE process_id=\? AND TRIM\(product_code\) IN/.test(sql)) {
      const wanted = params.slice(1).map((p) => String(p).toLowerCase());
      return standards.filter((r) => wanted.includes(trim(r.product_code).toLowerCase())).map((r) => ({ product_standard_id: r.id, product_code: r.product_code, encoding_code: r.encoding_code ?? null, work_type: r.work_type, standard_output: r.standard_output, exclude_kqd_from_tt: 0, status: r.status }));
    }
    if (/FROM product_standards ps WHERE/.test(sql)) {
      let rows = standards.filter((r) => r.process_id === params[0]);
      if (/ps\.status='active'/.test(sql)) rows = rows.filter((r) => r.status === 'active');
      const types = inList(sql);
      if (types) rows = rows.filter((r) => types.includes(trim(r.work_type).toUpperCase()));
      if (/BINARY TRIM\(product_code\)=BINARY TRIM\(\?\)/.test(sql)) rows = rows.filter((r) => trim(r.product_code) === trim(params[1]));
      else if (/BINARY TRIM\(encoding_code\)/.test(sql)) rows = rows.filter((r) => trim(r.encoding_code) === trim(params[1]));
      else rows = rows.filter((r) => String(r.product_code).toUpperCase() === String(params[1]).toUpperCase());
      return rows.sort((a, b) => a.id - b.id).slice(0, 2).map((r) => ({ product_standard_id: r.id, product_code: r.product_code, encoding_code: r.encoding_code ?? null, work_type: r.work_type, standard_output: r.standard_output, exclude_kqd_from_tt: 0 }));
    }
    if (/FROM product_standard_versions/.test(sql)) {
      const codes = /TRIM\(product_code\) IN/.test(sql) ? params.slice(1, -2).map((p) => String(p).toLowerCase()) : [String(params[1]).toLowerCase()];
      return versions.filter((v) => codes.includes(trim(v.product_code).toLowerCase()) && v.effective_from <= WORK_DATE && (!v.effective_to || v.effective_to >= WORK_DATE))
        .sort((a, b) => a.effective_from.localeCompare(b.effective_from) || a.version_no - b.version_no || a.id - b.id);
    }
    return [];
  };
  return { query, calls };
}
const std = (id, code, wt, status = 'active', out = 500) => ({ id, process_id: 1, product_code: code, work_type: wt, status, standard_output: out });
const ver = (id, code, out, from = '2026-01-01') => ({ id, process_id: 1, product_code: code, standard_output: out, version_no: 1, effective_from: from, effective_to: null, status: 'active' });

async function run(data, items, warm) {
  const { query, calls } = makeQuery(data);
  const resolver = createStandardResolver({ query });
  if (warm) await resolver.warmUp({ processId: 1, workDate: WORK_DATE, items });
  const out = [];
  for (const it of items) {
    try { const r = await resolver.resolveStandard({ processId: 1, productCode: it.productCode, machineId: it.machineId, machineCode: it.machineCode, workDate: WORK_DATE }); out.push({ code: r.productCode, std: r.productStandardId, ver: r.standardVersionId, out: r.standardOutput, src: r.source, wt: r.workType }); }
    catch (error) { out.push({ error: error.code }); }
  }
  return { out, calls };
}
const items = [{ machineId: 10, machineCode: 'M05', productCode: 'P1' }, { machineId: 11, machineCode: 'M06', productCode: 'P2' }];

test('warm and cold resolution are identical for the normal case and use fewer statements', async () => {
  const data = { standards: [std(1, 'P1', 'Cắt'), std(2, 'P2', 'LONG')], versions: [ver(7, 'P1', 400), ver(8, 'P2', 450)] };
  const cold = await run(data, items, false); const warm = await run(data, items, true);
  assert.deepEqual(warm.out, cold.out);
  assert.equal(warm.out[0].std, 1); assert.equal(warm.out[1].ver, 8);
  assert.ok(warm.calls.length < cold.calls.length, `${warm.calls.length} vs ${cold.calls.length}`);
  assert.equal(warm.calls.filter((s) => /FROM product_standards/.test(s)).length, 1);
  assert.equal(warm.calls.filter((s) => /FROM product_standard_versions/.test(s)).length, 1);
});

test('inactive product, wrong stored work type, missing product and conflicting rows resolve the same warm and cold', async () => {
  const data = {
    standards: [std(1, 'P1', 'Cắt', 'inactive'), std(2, 'P2', 'Cắt'), std(3, 'P3', 'GC'), std(4, 'P4', 'Cắt', 'active', 100), std(5, 'P4', 'Cắt', 'active', 200)],
    versions: [ver(8, 'P2', 450)],
  };
  const its = [
    { machineId: 10, machineCode: 'M05', productCode: 'P1' }, // inactive -> not found
    { machineId: 11, machineCode: 'M06', productCode: 'P2' }, // stored Cắt but machine is LONG -> mismatch error path
    { machineId: 10, machineCode: 'M05', productCode: 'P3' }, // generic GC work type
    { machineId: 10, machineCode: 'M05', productCode: 'P4' }, // two rows, different outputs -> conflict
    { machineId: 10, machineCode: 'M05', productCode: 'NOPE' },
  ];
  const cold = await run(data, its, false); const warm = await run(data, its, true);
  assert.deepEqual(warm.out, cold.out);
  assert.ok(cold.out.every((r) => r.error), JSON.stringify(cold.out));
});

test('case variants and ambiguous version rows are left to the per-line SQL (same answer as cold)', async () => {
  const data = { standards: [std(1, 'P1', 'Cắt'), std(2, 'p1', 'Cắt', 'inactive')], versions: [ver(7, 'P1', 400), ver(8, 'p1', 999, '2026-02-01')] };
  const its = [{ machineId: 10, machineCode: 'M05', productCode: 'P1' }];
  const cold = await run(data, its, false); const warm = await run(data, its, true);
  assert.deepEqual(warm.out, cold.out);
});

test('a second warmUp never serves rows of the first one', async () => {
  const data = { standards: [std(1, 'P1', 'Cắt')], versions: [ver(7, 'P1', 400)] };
  const { query } = makeQuery(data);
  const resolver = createStandardResolver({ query });
  const args = { processId: 1, productCode: 'P1', machineId: 10, machineCode: 'M05', workDate: WORK_DATE };
  await resolver.warmUp({ processId: 1, workDate: WORK_DATE, items: [{ machineId: 10, machineCode: 'M05', productCode: 'P1' }] });
  data.standards.length = 0; // the master row disappears between two requests on the same isolate
  data.versions.length = 0;
  const fresh = createStandardResolver({ query });
  await fresh.warmUp({ processId: 1, workDate: WORK_DATE, items: [{ machineId: 10, machineCode: 'M05', productCode: 'P1' }] });
  await assert.rejects(fresh.resolveStandard(args), (e) => e.code === 'HISTORICAL_STANDARD_NOT_FOUND');
  // same resolver instance: warming a different product clears the old maps first
  data.standards.push(std(1, 'P1', 'Cắt')); data.versions.push(ver(7, 'P1', 400));
  await resolver.warmUp({ processId: 1, workDate: WORK_DATE, items: [{ machineId: 10, machineCode: 'M05', productCode: 'P1' }] });
  data.standards.length = 0; data.versions.length = 0;
  await resolver.warmUp({ processId: 1, workDate: WORK_DATE, items: [{ machineId: 10, machineCode: 'M05', productCode: 'ZZ' }] });
  await assert.rejects(resolver.resolveStandard({ ...args, workDate: '2026-10-21' }), (e) => e.code === 'HISTORICAL_STANDARD_NOT_FOUND');
});
