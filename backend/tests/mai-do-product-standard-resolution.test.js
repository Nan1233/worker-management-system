'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createStandardResolver } = require('../services/standardResolutionService');

function makeResolver(products) {
  return createStandardResolver({ query: async (sql, params = []) => {
    if (sql.includes('FROM product_standards ps')) {
      const processId = Number(params[0]);
      const productCode = String(params[1] || '');
      const rows = products.filter(row => Number(row.process_id) === processId && row.product_code === productCode && row.status === 'active');
      if (sql.includes('BINARY TRIM(product_code)')) return rows.slice(0, 2);
      return [];
    }
    if (sql.includes('FROM product_standard_versions')) return [];
    throw new Error('Unexpected SQL: ' + sql);
  } });
}
const row = (process_id, id, work_type, standard_output, product_code = '5092') =>
  ({ process_id, product_standard_id: id, product_code, work_type, standard_output, status: 'active' });

test('MAI and DO select their own explicitly typed 5092 standards without machine', async () => {
  const resolver = makeResolver([
    row(2, 180002, null, 54), row(2, 180211, 'Mài', 54),
    row(3, 180005, null, 55), row(3, 180216, 'Đo', 55),
  ]);
  const mai = await resolver.resolveStandard({processId: 2, productCode: '5092', workDate: '2026-11-12'});
  const đo = await resolver.resolveStandard({processId: 3, productCode: '5092', workDate: '2026-11-12'});
  assert.equal(mai.productStandardId, 180211);
  assert.equal(mai.standardOutput, 54);
  assert.equal(đo.productStandardId, 180216);
  assert.equal(đo.standardOutput, 55);
  assert.equal(mai.machineId, null);
  assert.equal(đo.machineId, null);
});

test('two explicitly labeled standards in the same process remain ambiguous', async () => {
  const resolver = makeResolver([row(3, 1, 'Đo', 55), row(3, 2, 'Đo', 55)]);
  await assert.rejects(resolver.resolveProduct({processId:3,productCode:'5092',workDate:'2026-11-12'}), e => e.code === 'STANDARD_EFFECTIVE_RANGE_CONFLICT');
});

test('DO must not silently remove AUTO suffix from a missing product', async () => {
  const resolver = makeResolver([row(3, 20, 'Đo', 265, '5770-r20')]);
  await assert.rejects(resolver.resolveProduct({processId:3,productCode:'5770-r20-AUTO',workDate:'2026-11-12'}), e => e.code === 'HISTORICAL_STANDARD_NOT_FOUND');
});
