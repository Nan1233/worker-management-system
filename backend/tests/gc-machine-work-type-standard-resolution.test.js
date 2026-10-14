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

    if (text.includes('from product_aliases')) {
      const aliasCode = String(params[1] || '').trim().toUpperCase();
      if (aliasCode === '2801') return [{ product_code: 'QC3-2801' }];
      return [];
    }

    if (text.includes('from product_machine_standards')) {
      const lookupProduct = String(params[2] || '').trim().toUpperCase();
      if (lookupProduct === 'QC3-2801') {
        return [{
          id: 8801,
          process_id: 1,
          product_code: 'QC3-2801',
          machine_id: 16,
          standard_output: 180,
          calculated_output_per_hour: 180,
          standard_time_seconds: null,
          effective_from: '2026-01-01',
          effective_to: null,
          is_active: 1
        }];
      }
      return [];
    }

    if (text.includes('from product_standards')) {
      const isLong = /upper\(trim\(ps\.work_type\)\)\s*=\s*'lồng'/.test(text);
      const isCut = /upper\(trim\(ps\.work_type\)\)\s*=\s*'cắt'/.test(text);
      const requestedProduct = String(params[1] || '').trim().toUpperCase();

      if (!isLong && !isCut) {
        if (requestedProduct === '16H') {
          return [{
            product_standard_id: 70016,
            product_code: '16H',
            encoding_code: null,
            work_type: 'Lồng',
            standard_output: 250,
            exclude_kqd_from_tt: 0
          }];
        }
        throw new Error(`GC product lookup must specify work_type: ${text}`);
      }

      return [{
        product_standard_id: isLong ? 31 : 60031,
        product_code: '15U-T',
        encoding_code: '60031',
        work_type: isLong ? 'Lồng' : 'Cắt',
        standard_output: 180,
        exclude_kqd_from_tt: 0
      }];
    }

    if (text.includes('from product_standard_versions')) return [];

    throw new Error(`Unhandled SQL: ${text}; params=${JSON.stringify(params)}`);
  };
}

test('GC resolves machine standard through product alias 2801 -> QC3-2801', async () => {
  const queries = [];
  const baseQuery = createGcFixtureQuery();
  const query = async (sql, params = []) => {
    queries.push({ sql: String(sql), params: [...params] });
    return baseQuery(sql, params);
  };
  const resolver = createStandardResolver({ query });
  const resolved = await resolver.resolveStandard({
    processId: 1,
    productCode: '2801',
    machineCode: 'ML4',
    workDate: '2026-10-04'
  });

  const machineLookup = queries.find(q =>
    /from\s+product_machine_standards/i.test(q.sql) &&
    /product_code/i.test(q.sql)
  );
  assert.ok(machineLookup, 'Expected machine-standard lookup');
  assert.equal(String(machineLookup.params[2]).trim(), 'QC3-2801');
  assert.equal(resolved.machineStandardId, 8801);
  assert.equal(resolved.standardOutput, 180);
});

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

test('GC manual mode resolves to Lồng standard instead of treating Cắt/Lồng rows as ambiguous', async () => {
  const resolver = createStandardResolver({ query: createGcFixtureQuery() });
  const resolved = await resolver.resolveStandard({
    processId: 1,
    productCode: '15U-T',
    operationMode: 'MANUAL',
    workDate: '2026-10-04'
  });

  assert.equal(resolved.productStandardId, 31);
  assert.equal(resolved.standardOutput, 180);
  assert.equal(resolved.machineCode, null);
  assert.match(resolved.source, /LEGACY_PRODUCT_STANDARD/);
});

test('GC C1 falls back to the only process product standard when the machine has no standard for that work type', async () => {
  const resolver = createStandardResolver({ query: createGcFixtureQuery() });
  const resolved = await resolver.resolveStandard({
    processId: 1,
    productCode: '16H',
    machineCode: 'C1',
    workDate: '2026-10-04'
  });

  assert.equal(resolved.productStandardId, 70016);
  assert.equal(resolved.productCode, '16H');
  assert.equal(resolved.standardOutput, 250);
  assert.equal(resolved.machineCode, 'C1');
  assert.match(resolved.source, /PROCESS_FALLBACK/);
});

test('exact product code wins over another product using the same value as encoding_code', async () => {
  const queries = [];
  const query = async (sql, params = []) => {
    const text = String(sql).replace(/\\s+/g, ' ').trim().toLowerCase();
    queries.push(text);
    if (text.includes('from product_standards')) {
      if (/binary trim\\(product_code\\)=binary trim\\(\\?\\)/.test(text)) {
        return [{
          product_standard_id: 5770,
          product_code: '5770',
          encoding_code: null,
          work_type: 'Lồng',
          standard_output: 200,
          exclude_kqd_from_tt: 0
        }];
      }
      if (/binary trim\\(encoding_code\\)=binary trim\\(\\?\\)/.test(text)) {
        return [{
          product_standard_id: 8800,
          product_code: 'OTHER-PRODUCT',
          encoding_code: '5770',
          work_type: 'Lồng',
          standard_output: 900,
          exclude_kqd_from_tt: 0
        }];
      }
    }
    if (text.includes('from product_standard_versions')) return [];
    throw new Error(`Unexpected SQL: ${text}; params=${JSON.stringify(params)}`);
  };
  const resolver = createStandardResolver({ query });
  const resolved = await resolver.resolveProduct({
    processId: 1,
    productCode: '5770',
    workDate: '2026-10-14',
    workType: 'LONG'
  });
  assert.equal(resolved.productStandardId, 5770);
  assert.equal(resolved.productCode, '5770');
  assert.equal(resolved.standardOutput, 200);
  assert.equal(queries.filter(q => /binary trim\\(encoding_code\\)/.test(q)).length, 0);
});
