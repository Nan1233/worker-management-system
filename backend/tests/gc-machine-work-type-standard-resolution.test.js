const test = require('node:test');
const assert = require('node:assert/strict');
const { createStandardResolver } = require('../services/standardResolutionService');

function createGcFixtureQuery() {
  return async (sql, params = []) => {
    const text = String(sql).replace(/\s+/g, ' ').trim().toLowerCase();

    if (text.includes('from machines')) {
      const machineCode = String(params[4] || params[1] || '').trim().toUpperCase();
      return [{ id: 16, machine_code: machineCode || 'ML4', process_code: 'GC' }];
    }

    if (text.includes('from product_machine_standards')) return [];

    if (text.includes('from product_standards')) {
      const isLong = text.includes("upper(trim(ps.work_type)) = 'lồng'");
      const isCut = text.includes("upper(trim(ps.work_type)) = 'cắt'");
      if (!isLong && !isCut) {
        throw new Error(`GC product lookup must specify work_type: ${text}`);
      }
      return [{
        product_standard_id: isLong ? 31 : 60031,
        product_code: '15U-T',
        encoding_code: isLong ? '60031' : '60031',
        work_type: isLong ? 'Lồng' : 'Cắt',
        standard_output: 180,
        exclude_kqd_from_tt: 0
      }];
    }

    if (text.includes('from product_standard_versions')) return [];

    throw new Error(`Unhandled SQL: ${text}; params=${JSON.stringify(params)}`);
  };
}

test('GC ML4 resolves 15U-T to Lồng standard 180 instead of treating Cắt/Lồng rows as ambiguous', async () => {
  const resolver = createStandardResolver({ query: createGcFixtureQuery() });
  const resolved = await resolver.resolveStandard({
    processId: 1,
    productCode: '15U-T',
    machineCode: 'ML4',
    workDate: '2026-10-04'
  });

  assert.equal(resolved.productStandardId, 31);
  assert.equal(resolved.productCode, '15U-T');
  assert.equal(resolved.standardOutput, 180);
  assert.equal(resolved.machineCode, 'ML4');
  assert.match(resolved.source, /LEGACY_PRODUCT_STANDARD/);
});

test('GC C5 resolves product standards through Cắt work type when no machine-specific standard exists', async () => {
  const resolver = createStandardResolver({ query: createGcFixtureQuery() });
  const resolved = await resolver.resolveStandard({
    processId: 1,
    productCode: '15U-T',
    machineCode: 'C5',
    workDate: '2026-10-04'
  });

  assert.equal(resolved.productStandardId, 60031);
  assert.equal(resolved.standardOutput, 180);
  assert.equal(resolved.machineCode, 'C5');
});
