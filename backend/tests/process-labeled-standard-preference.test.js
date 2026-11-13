const test = require('node:test');
const assert = require('node:assert/strict');
const { createStandardResolver } = require('../services/standardResolutionService');

function resolver(standards) {
  return createStandardResolver({ query: async (sql, params = []) => {
    if (/FROM product_standard_versions/i.test(sql)) return [];
    if (/FROM product_standards/i.test(sql)) {
      const product = String(params[1] || '').trim();
      return standards.filter(s => s.product_code === product && s.status === 'active')
        .map(s => ({ product_standard_id: s.id, ...s }));
    }
    throw new Error('Unexpected SQL: ' + sql);
  }});
}

const rows = [
  { id: 180099, product_code: '9436-4', work_type: '', standard_output: 734.4, status: 'active' },
  { id: 180329, product_code: '9436-4', work_type: 'Ép', standard_output: 734.4, status: 'active' }
];

test('EP: prefer explicit Ép standard over blank legacy row', async () => {
  const result = await resolver(rows).resolveProduct({ processId: 7, productCode: '9436-4', workDate: '2026-11-05' });
  assert.equal(result.productStandardId, 180329);
  assert.equal(result.standardOutput, 734.4);
});

test('EP: multiple explicit standards remain a conflict', async () => {
  await assert.rejects(
    resolver([...rows, { ...rows[1], id: 180330 }]).resolveProduct({ processId: 7, productCode: '9436-4', workDate: '2026-11-05' }),
    error => error.code === 'STANDARD_EFFECTIVE_RANGE_CONFLICT'
  );
});

test('EP: a sole blank legacy standard remains usable', async () => {
  const result = await resolver([rows[0]]).resolveProduct({ processId: 7, productCode: '9436-4', workDate: '2026-11-05' });
  assert.equal(result.productStandardId, 180099);
});

test('CAN: prefer labeled Cán standard over blank legacy row', async () => {
  const result = await resolver([
    { ...rows[0], id: 1 },
    { ...rows[1], id: 2, work_type: 'Cán' }
  ]).resolveProduct({ processId: 8, productCode: '9436-4', workDate: '2026-11-05' });
  assert.equal(result.productStandardId, 2);
});
