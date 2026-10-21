const test = require('node:test');
const assert = require('node:assert/strict');
const { createStandardResolver } = require('../services/standardResolutionService');

// Isolated in-memory master data. No database, no network.
const MACHINES = { C13: 'CUT', C5: 'CUT', ML4: 'LONG', C14: null };

function makeDb({ standards = [], aliases = [] } = {}) {
  return async (sql, params = []) => {
    const text = String(sql).replace(/\s+/g, ' ').trim().toLowerCase();
    if (text.includes('from machines')) {
      const code = String(params[4] || params[1] || '').trim().toUpperCase();
      return code in MACHINES ? [{ id: 1, machine_code: code, gc_work_type: MACHINES[code], process_code: 'GC' }] : [];
    }
    if (text.includes('from product_aliases')) {
      const alias = String(params[1] || '').trim().toUpperCase();
      return aliases.filter((a) => a.alias === alias).map((a) => ({ product_code: a.product }));
    }
    if (text.includes('from product_machine_standards')) return [];
    if (text.includes('from product_standard_versions')) return [];
    if (text.includes('from product_standards')) {
      const cut = text.includes("in ('cắt','cat','cut')");
      const long = text.includes("in ('lồng','long')");
      const wanted = String(params[1] || '').trim();
      const byCode = (field) => standards.filter((s) => String(s[field] || '').trim() === wanted);
      const rows = byCode('product_code').length ? byCode('product_code') : byCode('encoding_code');
      return rows
        .filter((s) => s.status !== 'inactive')
        .filter((s) => {
          const t = String(s.work_type ?? '').trim().toUpperCase();
          if (cut) return ['CẮT', 'CAT', 'CUT'].includes(t);
          if (long) return ['LỒNG', 'LONG'].includes(t);
          return true;
        })
        .map((s, i) => ({ product_standard_id: s.id ?? 100 + i, encoding_code: null, exclude_kqd_from_tt: 0, ...s }));
    }
    throw new Error(`Unhandled SQL: ${text}`);
  };
}

const ALIAS_C7236 = [{ alias: 'C7236', product: 'R7236' }];
const std = (work_type, extra = {}) => ({ product_code: 'R7236', work_type, standard_output: 690, ...extra });
const resolve = (db, over = {}) => createStandardResolver({ query: makeDb(db) }).resolveStandard({
  processId: 1, productCode: 'C7236', machineCode: 'C13', workDate: '2026-10-21', ...over
});

test('alias C7236 -> R7236 whose standard is stored as generic work_type GC fails closed with an explicit mismatch code', async () => {
  await assert.rejects(resolve({ standards: [std('GC')], aliases: ALIAS_C7236 }), (e) => {
    assert.equal(e.code, 'STANDARD_WORK_TYPE_MISMATCH');
    assert.equal(e.status, 422);
    assert.deepEqual(e.details.stored_work_types, ['GC']);
    assert.match(e.message, /C7236/);
    return true;
  });
});

test('alias C7236 -> R7236 with work_type Cắt resolves on cutting machine C13', async () => {
  const r = await resolve({ standards: [std('Cắt')], aliases: ALIAS_C7236 });
  assert.equal(r.productCode, 'R7236');
  assert.equal(Number(r.standardOutput), 690);
});

test('work_type Lồng resolves on a Lồng machine and CUT spelling resolves as Cắt', async () => {
  const lg = await resolve({ standards: [std('Lồng')], aliases: ALIAS_C7236 }, { machineCode: 'ML4' });
  assert.equal(lg.productCode, 'R7236');
  const cut = await resolve({ standards: [std('CUT')], aliases: ALIAS_C7236 });
  assert.equal(cut.productCode, 'R7236');
});

test("stored 'LONG' matches Lồng but never Cắt; NULL and unknown values are explicit mismatches", async () => {
  assert.equal((await resolve({ standards: [std('LONG')], aliases: ALIAS_C7236 }, { machineCode: 'ML4' })).productCode, 'R7236');
  await assert.rejects(resolve({ standards: [std('LONG')], aliases: ALIAS_C7236 }), (e) => e.code === 'HISTORICAL_STANDARD_NOT_FOUND');
  for (const bad of [null, '', 'XYZ']) {
    await assert.rejects(resolve({ standards: [std(bad)], aliases: ALIAS_C7236 }), (e) => e.code === 'STANDARD_WORK_TYPE_MISMATCH', String(bad));
  }
});

test('no standard at all stays HISTORICAL_STANDARD_NOT_FOUND', async () => {
  await assert.rejects(resolve({ standards: [], aliases: ALIAS_C7236 }), (e) => e.code === 'HISTORICAL_STANDARD_NOT_FOUND');
});

test('an inactive standard is not usable and is not reported as a work_type mismatch', async () => {
  await assert.rejects(resolve({ standards: [std('GC', { status: 'inactive' })], aliases: ALIAS_C7236 }), (e) => e.code === 'HISTORICAL_STANDARD_NOT_FOUND');
});

test('an alias mapping to two products is a PRODUCT_ALIAS_CONFLICT', async () => {
  await assert.rejects(
    resolve({ standards: [std('Cắt')], aliases: [{ alias: 'C7236', product: 'R7236' }, { alias: 'C7236', product: 'R7237' }] }),
    (e) => e.code === 'PRODUCT_ALIAS_CONFLICT'
  );
});

test('several different candidate standards for the same product are a STANDARD_EFFECTIVE_RANGE_CONFLICT', async () => {
  await assert.rejects(
    resolve({ standards: [std('Cắt', { id: 1, standard_output: 690 }), std('Cắt', { id: 2, standard_output: 700 })], aliases: ALIAS_C7236 }),
    (e) => e.code === 'STANDARD_EFFECTIVE_RANGE_CONFLICT'
  );
});

test('C13 without a configured gc_work_type is rejected before any product lookup', async () => {
  await assert.rejects(resolve({ standards: [std('Cắt')], aliases: ALIAS_C7236 }, { machineCode: 'C14' }), (e) => e.code === 'GC_WORK_TYPE_UNRESOLVED');
});

test('check-similar style input (no work_type / operation_mode / machine_id) resolves with the same rule as create', async () => {
  // validateMasterData derives work type from the machine master; check-similar adds nothing else.
  const checkSimilar = await resolve({ standards: [std('Cắt')], aliases: ALIAS_C7236 }, { operationMode: 'MACHINE', machineId: null, workType: null });
  const create = await resolve({ standards: [std('Cắt')], aliases: ALIAS_C7236 }, { operationMode: 'MACHINE', workType: 'Cắt' });
  assert.equal(checkSimilar.productStandardId, create.productStandardId);
  assert.equal(checkSimilar.standardOutput, create.standardOutput);
});

// resolveStandard looks up product_machine_standards FIRST (machine id + canonical product after
// alias + effective dates) and only falls through to resolveProduct (product_standards) when that
// finds nothing usable. These tests pin the three ways a C13/R7236/690 machine standard can be missed.
function withMachineStandard(base, machineStandards) {
  const seen = [];
  const query = async (sql, params = []) => {
    if (/from product_machine_standards/i.test(String(sql))) {
      const [pid, machineId, product, date] = params;
      seen.push({ product, date });
      return machineStandards.filter((m) => m.product_code === String(product).trim() && m.machine_id === machineId
        && (!m.effective_from || m.effective_from <= date) && (!m.effective_to || m.effective_to >= date));
    }
    return base(sql, params);
  };
  return { query, seen };
}
const MS_R7236 = { id: 9, process_id: 1, product_code: 'R7236', machine_id: 1, standard_output: 690, calculated_output_per_hour: 690, standard_time_seconds: 5.2, effective_from: '2026-10-20', effective_to: null, is_active: 1 };
const run = (query, workDate = '2026-10-21') => createStandardResolver({ query }).resolveStandard({ processId: 1, productCode: 'C7236', machineCode: 'C13', workDate });

test('alias present + machine standard in effect: resolves from the machine standard (690), independent of product_standards.work_type', async () => {
  const { query, seen } = withMachineStandard(makeDb({ standards: [std('GC')], aliases: ALIAS_C7236 }), [MS_R7236]);
  const r = await run(query);
  assert.equal(Number(r.standardOutput), 690);
  assert.equal(r.source.startsWith('MACHINE'), true);
  assert.equal(seen[0].product, 'R7236', 'machine standard is looked up by the alias target');
});

test('alias MISSING: machine standard is looked up as C7236, finds nothing, falls to product_standards and fails closed', async () => {
  const { query, seen } = withMachineStandard(makeDb({ standards: [std('GC')], aliases: [] }), [MS_R7236]);
  await assert.rejects(run(query), (e) => e.code === 'HISTORICAL_STANDARD_NOT_FOUND');
  assert.equal(seen[0].product, 'C7236');
});

test('work_date BEFORE the machine standard effective_from: machine standard not in effect, falls to product_standards', async () => {
  const { query } = withMachineStandard(makeDb({ standards: [std('GC')], aliases: ALIAS_C7236 }), [MS_R7236]);
  await assert.rejects(run(query, '2026-10-10'), (e) => e.code === 'STANDARD_WORK_TYPE_MISMATCH');
});
