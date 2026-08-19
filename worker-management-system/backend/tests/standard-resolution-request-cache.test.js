const test = require('node:test');
const assert = require('node:assert/strict');
const { createStandardResolver } = require('../services/standardResolutionService');

test('standard resolver caches exact historical/master lookups within one request scope', async () => {
  let calls = 0;
  const fakeQuery = async (sql) => {
    calls += 1;
    if (sql.includes('FROM product_standards')) return [{ product_standard_id: 10, product_code: 'P1' }];
    if (sql.includes('FROM product_standard_versions')) return [{ id: 20, process_id: 1, product_code: 'P1', standard_output: '12.5', exclude_kqd_from_tt: 0, version_no: 1, effective_from: '2026-01-01', effective_to: null }];
    if (sql.includes('FROM machines')) return [{ id: 30, machine_code: 'M1' }];
    if (sql.includes('FROM product_machine_standards') && sql.includes('machine_id=?')) return [{ id: 40, standard_output: '15', calculated_output_per_hour: '15', standard_time_seconds: null, effective_from: null, effective_to: null }];
    throw new Error(`Unexpected query: ${sql}`);
  };
  const resolver = createStandardResolver({ query: fakeQuery });
  const input = { processId: 1, productCode: 'P1', machineId: 30, machineCode: 'M1', workDate: '2026-08-13' };
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
    if (sql.includes('FROM product_standards')) return [{ product_standard_id: 10, product_code: 'P1' }];
    if (sql.includes('FROM product_standard_versions')) return [{ id: 20, process_id: 1, product_code: 'P1', standard_output: '12.5', exclude_kqd_from_tt: 0, version_no: 1, effective_from: '2026-01-01', effective_to: null }];
    if (sql.includes('FROM machines')) return [{ id: Number(params[1]), machine_code: params[3] }];
    if (sql.includes('FROM product_machine_standards') && sql.includes('machine_id=?')) return [{ id: 40 + Number(params[2]), standard_output: String(10 + Number(params[2])), calculated_output_per_hour: String(10 + Number(params[2])), standard_time_seconds: null, effective_from: null, effective_to: null }];
    throw new Error(`Unexpected query: ${sql}`);
  };
  const resolver = createStandardResolver({ query: fakeQuery });
  const a = await resolver.resolveStandard({ processId: 1, productCode: 'P1', machineId: 30, machineCode: 'M1', workDate: '2026-08-13' });
  const afterA = calls;
  const b = await resolver.resolveStandard({ processId: 1, productCode: 'P1', machineId: 31, machineCode: 'M2', workDate: '2026-08-13' });
  assert.notEqual(a.machineId, b.machineId);
  assert.ok(calls > afterA, 'different machine still performs machine-specific lookup');
});
