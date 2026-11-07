'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createStandardResolver } = require('../services/standardResolutionService');

function makeResolver(versions) {
  const calls = [];
  const query = async (sql, params = []) => {
    calls.push({ sql, params });
    if (/FROM product_standards ps/i.test(sql)) {
      // The product is explicitly configured; aliases are not used.
      if (/BINARY TRIM\(product_code\)/i.test(sql)) {
        return params[1] === 'P-100'
          ? [{ product_standard_id: 4, product_code: 'P-100', work_type: 'Cắt', standard_output: 360 }]
          : [];
      }
      return [];
    }
    if (/FROM product_standard_versions/i.test(sql)) return versions;
    throw new Error('Unexpected SQL: ' + sql);
  };
  return { resolver: createStandardResolver({ query }), calls };
}

const params = { processId: 1, productCode: 'P-100', workDate: '2026-10-21', workType: 'Cắt' };
const version = (id, status, standardOutput) => ({
  id, process_id: 1, product_code: 'P-100', standard_output: standardOutput,
  version_no: id, effective_from: '2026-10-01', effective_to: null, status
});

test('two versions with overlapping effective dates fail closed even when one is inactive', async () => {
  const { resolver } = makeResolver([version(1, 'active', 360), version(2, 'inactive', 420)]);
  await assert.rejects(() => resolver.resolveProduct(params), (error) => {
    assert.equal(error.code, 'STANDARD_EFFECTIVE_RANGE_CONFLICT');
    assert.equal(error.status, 422);
    assert.deepEqual(error.details.version_ids, [1, 2]);
    return true;
  });
});

test('a single historical version resolves on work_date regardless of its current status', async () => {
  const { resolver } = makeResolver([version(7, 'inactive', 360)]);
  const resolved = await resolver.resolveProduct(params);
  assert.equal(resolved.standardVersionId, 7);
  assert.equal(resolved.standardOutput, 360);
  assert.equal(resolved.source, 'PRODUCT_VERSION_HISTORICAL');
});

test('non-overlapping historical versions select only the version effective on work_date', async () => {
  const { resolver } = makeResolver([
    { ...version(1, 'inactive', 200), effective_to: '2026-09-30' },
    version(2, 'active', 360)
  ]);
  const resolved = await resolver.resolveProduct(params);
  assert.equal(resolved.standardVersionId, 2);
  assert.equal(resolved.standardOutput, 360);
});
