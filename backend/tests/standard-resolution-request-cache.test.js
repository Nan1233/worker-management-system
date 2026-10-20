const test = require('node:test');
const assert = require('node:assert/strict');
const { createStandardResolver } = require('../services/standardResolutionService');

test('standard resolver caches exact historical/master lookups within one request scope', async () => {
  let calls = 0;
  const fakeQuery = async (sql) => {
    calls += 1;
    if (sql.includes('FROM product_aliases') || sql.includes('product_aliases')) return [];
    if (sql.includes('FROM product_standards')) return [{ product_standard_id: 10, product_code: 'P1', standard_output: '12.5', exclude_kqd_from_tt: 0 }];
    if (sql.includes('FROM product_standard_versions')) return [{ id: 20, process_id: 1, product_code: 'P1', standard_output: '12.5', exclude_kqd_from_tt: 0, version_no: 1, effective_from: '2026-01-01', effective_to: null }];
    if (sql.includes('FROM machines')) return [{ id: 30, machine_code: 'ML1', process_code: 'GC' }];
    if (sql.includes('FROM product_machine_standards') && sql.includes('machine_id=?')) return [{ id: 40, standard_output: '15', calculated_output_per_hour: '15', standard_time_seconds: null, effective_from: null, effective_to: null }];
    throw new Error(`Unexpected query: ${sql}`);
  };
  const resolver = createStandardResolver({ query: fakeQuery });
  const input = { processId: 1, productCode: 'P1', machineId: 30, machineCode: 'ML1', workDate: '2026-08-13' };
  const first = await resolver.resolveStandard(input);
  const firstCallCount = calls;
  const second = await resolver.resolveStandard(input);
  assert.deepEqual(second, first);
  assert.equal(calls, firstCallCount, 'identical lookup should not issue new DB queries within resolver scope');
});

test('standard resolver does not conflate different machines', async () => {
  let calls = 0;
  const fakeQuery = async (sql, params) => {
    calls += 1;
    if (sql.includes('FROM product_aliases') || sql.includes('product_aliases')) return [];
    if (sql.includes('FROM product_standards')) return [{ product_standard_id: 10, product_code: 'P1', standard_output: '12.5', exclude_kqd_from_tt: 0 }];
    if (sql.includes('FROM product_standard_versions')) return [{ id: 20, process_id: 1, product_code: 'P1', standard_output: '12.5', exclude_kqd_from_tt: 0, version_no: 1, effective_from: '2026-01-01', effective_to: null }];
    if (sql.includes('FROM machines')) return [{ id: Number(params[1]), machine_code: params[3], process_code: 'GC' }];
    if (sql.includes('FROM product_machine_standards') && sql.includes('machine_id=?')) return [{ id: 40 + Number(params[2]), standard_output: String(10 + Number(params[2])), calculated_output_per_hour: String(10 + Number(params[2])), standard_time_seconds: null, effective_from: null, effective_to: null }];
    throw new Error(`Unexpected query: ${sql}`);
  };
  const resolver = createStandardResolver({ query: fakeQuery });
  const a = await resolver.resolveStandard({ processId: 1, productCode: 'P1', machineId: 30, machineCode: 'M1', workDate: '2026-08-13' });
  const afterA = calls;
  const b = await resolver.resolveStandard({ processId: 1, productCode: 'P1', machineId: 31, machineCode: 'ML2', workDate: '2026-08-13' });
  assert.notEqual(a.machineId, b.machineId);
  assert.ok(calls > afterA, 'different machine still performs machine-specific lookup');
});

test('standard resolver falls back to the historical product standard when selected machine has no mapping', async () => {
  const fakeQuery = async (sql) => {
    if (sql.includes('FROM product_aliases') || sql.includes('product_aliases')) return [];
    if (sql.includes('FROM product_standards')) return [{ product_standard_id: 100, product_code: '6495-m', standard_output: '1450', exclude_kqd_from_tt: 0 }];
    if (sql.includes('FROM product_standard_versions')) return [];
    if (sql.includes('FROM machines')) return [{ id: 2, machine_code: 'ML2', process_code: 'GC' }];
    if (sql.includes('FROM product_machine_standards') && sql.includes('machine_id=?')) return [];
    throw new Error(`Unexpected query: ${sql}`);
  };

  const resolver = createStandardResolver({ query: fakeQuery });
  const resolved = await resolver.resolveStandard({
    processId: 1,
    productCode: '6495-m',
    machineId: 2,
    machineCode: 'ML2',
    workDate: '2026-09-09'
  });

  assert.equal(resolved.standardOutput, 1450);
  assert.equal(resolved.machineId, 2);
  assert.equal(resolved.machineCode, 'ML2');
  assert.equal(resolved.machineStandardId, null);
  assert.equal(resolved.source, 'LEGACY_PRODUCT_STANDARD_MACHINE_FALLBACK');
});


test('standard resolver canonicalizes only a unique AUTO code casing variant', async () => {
  const seen = [];
  const fakeQuery = async (sql, params = []) => {
    seen.push({ sql, params });
    if (sql.includes('FROM product_aliases') || sql.includes('product_aliases')) return [];
    if (sql.includes('FROM machines')) return [{ id: 11, machine_code: 'C6', process_code: 'GC' }];
    if (sql.includes('FROM product_machine_standards')) return [];
    if (sql.includes('FROM product_standards')) {
      if (sql.includes('UPPER(TRIM(product_code))=UPPER(TRIM(?))')) {
        return [{ product_standard_id: 52, product_code: 'C5770-AUTO', encoding_code: '60048', work_type: 'Cắt', standard_output: '6660', exclude_kqd_from_tt: 0 }];
      }
      return [];
    }
    if (sql.includes('FROM product_standard_versions')) return [];
    throw new Error(`Unexpected query: ${sql}`);
  };
  const resolver = createStandardResolver({ query: fakeQuery });
  const resolved = await resolver.resolveStandard({
    processId: 1,
    productCode: 'c5770-AUTO',
    machineId: 11,
    machineCode: 'C6',
    workDate: '2026-10-10'
  });
  assert.equal(resolved.productCode, 'C5770-AUTO');
  assert.equal(resolved.standardOutput, 6660);
  assert.equal(resolved.productStandardId, 52);
  assert.ok(seen.some((item) => item.sql.includes('UPPER(TRIM(product_code))=UPPER(TRIM(?))')));
});

test('standard resolver refuses ambiguous AUTO casing variants', async () => {
  const fakeQuery = async (sql) => {
    if (sql.includes('FROM product_aliases') || sql.includes('product_aliases')) return [];
    if (sql.includes('FROM machines')) return [{ id: 11, machine_code: 'C6', process_code: 'GC' }];
    if (sql.includes('FROM product_machine_standards')) return [];
    if (sql.includes('FROM product_standards')) {
      if (sql.includes('UPPER(TRIM(product_code))=UPPER(TRIM(?))')) return [
        { product_standard_id: 52, product_code: 'C5770-AUTO', standard_output: '6660', exclude_kqd_from_tt: 0 },
        { product_standard_id: 53, product_code: 'c5770-auto', standard_output: '849', exclude_kqd_from_tt: 0 }
      ];
      return [];
    }
    throw new Error(`Unexpected query: ${sql}`);
  };
  const resolver = createStandardResolver({ query: fakeQuery });
  await assert.rejects(
    resolver.resolveStandard({ processId: 1, productCode: 'c5770-AUTO', machineId: 11, machineCode: 'C6', workDate: '2026-10-10' }),
    /Có nhiều định mức AUTO mâu thuẫn/
  );
});
