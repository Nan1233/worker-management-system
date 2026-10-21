const test = require('node:test');
const assert = require('node:assert/strict');
const { createStandardResolver } = require('../services/standardResolutionService');

// Fixture of the machine master (machines.gc_work_type, migration 059). The Cắt/Lồng type
// comes from this table, never from the machine-code prefix. 'C14' and 'C20' are active
// machines that have NO configured type; they must be rejected, not guessed.
const GC_MACHINE_MASTER = Object.freeze({
  C1: 'CUT', C2: 'CUT', C5: 'CUT', C12: 'CUT', C13: 'CUT',
  ML1: 'LONG', ML4: 'LONG', ML20: 'LONG', ML21: 'LONG',
  C14: null, C20: null, Z9: null
});
const gcType = (code) => Object.prototype.hasOwnProperty.call(GC_MACHINE_MASTER, code) ? GC_MACHINE_MASTER[code] : null;

function createGcFixtureQuery() {
  return async (sql, params = []) => {
    const text = String(sql).replace(/\s+/g, ' ').trim().toLowerCase();

    if (text.includes('from machines')) {
      const machineCode = String(params[4] || params[1] || '').trim().toUpperCase();
      return [{ id: 16, machine_code: machineCode || 'ML4', gc_work_type: gcType(machineCode || 'ML4'), process_code: 'GC' }];
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

      if (requestedProduct === '16H') return [];

      if (requestedProduct !== '15U-T') return [];

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

test('GC manual mode without a recognized machine or explicit work_type fails closed', async () => {
  const resolver = createStandardResolver({ query: createGcFixtureQuery() });
  await assert.rejects(
    resolver.resolveStandard({
      processId: 1,
      productCode: '15U-T',
      operationMode: 'MANUAL',
      workDate: '2026-10-04'
    }),
    error => error.code === 'GC_WORK_TYPE_UNRESOLVED'
  );
});

test('GC C1 does not fall back to a Lồng standard when the Cắt standard is missing', async () => {
  const resolver = createStandardResolver({ query: createGcFixtureQuery() });
  await assert.rejects(
    resolver.resolveStandard({
      processId: 1,
      productCode: '16H',
      machineCode: 'C1',
      workDate: '2026-10-04'
    }),
    error => error.code === 'HISTORICAL_STANDARD_NOT_FOUND' && error.details?.work_type === 'CUT'
  );
});

test('GC machine groups map C1/C2/C5/C12/C13 to Cắt and ML1/ML4/ML20 to Lồng (from the master)', async () => {
  const cutMachines = ['C1', 'C2', 'C5', 'C12', 'C13'];
  const longMachines = ['ML1', 'ML4', 'ML20'];
  for (const machineCode of cutMachines) {
    const resolver = createStandardResolver({ query: createGcFixtureQuery() });
    const resolved = await resolver.resolveStandard({
      processId: 1, productCode: '15U-T', machineCode, workDate: '2026-10-04'
    });
    assert.equal(resolved.productStandardId, 60031, `${machineCode} must resolve Cắt`);
    assert.equal(resolved.standardOutput, 180);
  }
  for (const machineCode of longMachines) {
    const resolver = createStandardResolver({ query: createGcFixtureQuery() });
    const resolved = await resolver.resolveStandard({
      processId: 1, productCode: '15U-T', machineCode, workDate: '2026-10-04'
    });
    assert.equal(resolved.productStandardId, 31, `${machineCode} must resolve Lồng`);
    assert.equal(resolved.standardOutput, 180);
  }
});

test('GC C13 resolves to Cắt because the machine master configures it as CUT (not because of its prefix)', async () => {
  const resolver = createStandardResolver({ query: createGcFixtureQuery() });
  const resolved = await resolver.resolveStandard({
    processId: 1, productCode: '15U-T', machineCode: 'C13', workDate: '2026-10-04'
  });
  assert.equal(resolved.productStandardId, 60031, 'C13 must resolve the Cắt standard');
  assert.equal(resolved.standardOutput, 180);
});
test('GC machines without a configured type are rejected, including C-prefixed codes and C13 itself', async () => {
  for (const machineCode of ['C14', 'C20', 'Z9']) {
    const resolver = createStandardResolver({ query: createGcFixtureQuery() });
    await assert.rejects(
      resolver.resolveStandard({ processId: 1, productCode: '15U-T', machineCode, workDate: '2026-10-04' }),
      (error) => error.code === 'GC_WORK_TYPE_UNRESOLVED' && /chưa được cấu hình loại gia công/.test(error.message),
      `${machineCode} must not be guessed from its prefix`
    );
  }
  // C13 is not special-cased: with the type unset it is rejected like any other machine.
  const unconfigured = createStandardResolver({
    query: async (sql, params = []) => {
      const text = String(sql).replace(/\s+/g, ' ').trim().toLowerCase();
      if (text.includes('from machines')) return [{ id: 99, machine_code: 'C13', gc_work_type: null, process_code: 'GC' }];
      return createGcFixtureQuery()(sql, params);
    }
  });
  await assert.rejects(
    unconfigured.resolveStandard({ processId: 1, productCode: '15U-T', machineCode: 'C13', workDate: '2026-10-04' }),
    (error) => error.code === 'GC_WORK_TYPE_UNRESOLVED'
  );
});
test('GC machine type from the master is honoured beyond the old C1-C12 / ML1-ML20 ranges (ML21)', async () => {
  const resolver = createStandardResolver({ query: createGcFixtureQuery() });
  const resolved = await resolver.resolveStandard({
    processId: 1, productCode: '15U-T', machineCode: 'ML21', workDate: '2026-10-04'
  });
  assert.equal(resolved.productStandardId, 31, 'ML21 must resolve Lồng from the master');
});
test('GC explicit CUT cannot override a machine the master configures as LONG, and C13 rejects explicit LONG', async () => {
  const resolver = createStandardResolver({ query: createGcFixtureQuery() });
  await assert.rejects(
    resolver.resolveStandard({ processId: 1, productCode: '15U-T', machineCode: 'C13', workType: 'LONG', workDate: '2026-10-04' }),
    (error) => error.code === 'GC_WORK_TYPE_MISMATCH'
  );
});
test('GC works when migration 059 is not applied: missing column falls back, then fails closed with a clear message', async () => {
  let attempts = 0;
  const base = createGcFixtureQuery();
  const resolver = createStandardResolver({
    query: async (sql, params = []) => {
      const text = String(sql).replace(/\s+/g, ' ').trim().toLowerCase();
      if (text.includes('from machines') && text.includes('gc_work_type')) {
        attempts += 1;
        const error = new Error("Unknown column 'm.gc_work_type' in 'field list'");
        error.errno = 1054; error.code = 'ER_BAD_FIELD_ERROR';
        throw error;
      }
      if (text.includes('from machines')) return [{ id: 16, machine_code: 'C13', process_code: 'GC' }];
      return base(sql, params);
    }
  });
  await assert.rejects(
    resolver.resolveStandard({ processId: 1, productCode: '15U-T', machineCode: 'C13', workDate: '2026-10-04' }),
    (error) => error.code === 'GC_WORK_TYPE_UNRESOLVED' && /chưa được cấu hình loại gia công/.test(error.message)
  );
  assert.equal(attempts, 1, 'the new column is attempted once, then the legacy query is used');
});

test('GC explicit work_type cannot override the machine group', async () => {
  const resolver = createStandardResolver({ query: createGcFixtureQuery() });
  await assert.rejects(
    resolver.resolveStandard({
      processId: 1,
      productCode: '15U-T',
      machineCode: 'ML4',
      workType: 'CUT',
      workDate: '2026-10-04'
    }),
    error => error.code === 'GC_WORK_TYPE_MISMATCH'
  );
});

test('exact product code wins over another product using the same value as encoding_code', async () => {
  const queries = [];
  const query = async (sql, params = []) => {
    const text = String(sql).replace(/\\s+/g, ' ').trim().toLowerCase();
    queries.push(text);
    if (text.includes('from product_standards')) {
      if (text.includes('binary trim(product_code)=binary trim(?)')) {
        return [{
          product_standard_id: 5770,
          product_code: '5770',
          encoding_code: null,
          work_type: 'Lồng',
          standard_output: 200,
          exclude_kqd_from_tt: 0
        }];
      }
      if (text.includes('binary trim(encoding_code)=binary trim(?)')) {
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
  assert.equal(queries.filter(q => q.includes('binary trim(encoding_code)')).length, 0);
});


test('GC conflicting active standards fail with a business conflict instead of selecting the highest output', async () => {
  const query = async (sql, params = []) => {
    const text = String(sql).replace(/\\s+/g, ' ').trim().toLowerCase();
    if (text.includes('from product_standards')) {
      if (text.includes("upper(trim(ps.work_type))='lồng'") && text.includes('binary trim(product_code)=binary trim(?)')) {
        return [
          { product_standard_id: 11, product_code: '5770', encoding_code: null, work_type: 'Lồng', standard_output: 605, exclude_kqd_from_tt: 0 },
          { product_standard_id: 12, product_code: '5770', encoding_code: null, work_type: 'Lồng', standard_output: 605, exclude_kqd_from_tt: 0 },
          { product_standard_id: 180438, product_code: '5770', encoding_code: null, work_type: 'Lồng', standard_output: 365, exclude_kqd_from_tt: 0 }
        ];
      }
    }
    if (text.includes('from product_standard_versions')) return [];
    throw new Error(`Unexpected SQL: ${text}; params=${JSON.stringify(params)}`);
  };
  const resolver = createStandardResolver({ query });
  await assert.rejects(
    resolver.resolveProduct({
      processId: 1,
      productCode: '5770',
      workDate: '2026-10-14',
      workType: 'LONG'
    }),
    error => error.code === 'STANDARD_EFFECTIVE_RANGE_CONFLICT'
      && error.details?.conflicting_standard_ids?.includes(11)
      && error.details?.conflicting_standard_ids?.includes(180438)
  );
});


test('GC conflicting active machine standards fail instead of selecting one row', async () => {
  const query = async (sql) => {
    const text = String(sql).replace(/\s+/g, ' ').trim().toLowerCase();
    if (text.includes('from machines')) return [{ id: 16, machine_code: 'ML4', gc_work_type: 'LONG', process_code: 'GC' }];
    if (text.includes('from product_aliases')) return [];
    if (text.includes('from product_machine_standards')) return [
      { id: 41, process_id: 1, product_code: '15U-T', machine_id: 16, standard_output: 180, calculated_output_per_hour: 180, effective_from: '2026-01-01', effective_to: null, is_active: 1 },
      { id: 42, process_id: 1, product_code: '15U-T', machine_id: 16, standard_output: 200, calculated_output_per_hour: 200, effective_from: '2026-01-01', effective_to: null, is_active: 1 }
    ];
    throw new Error(`Unexpected SQL: ${text}`);
  };
  const resolver = createStandardResolver({ query });
  await assert.rejects(
    resolver.resolveStandard({
      processId: 1, productCode: '15U-T', machineCode: 'ML4', workDate: '2026-10-04'
    }),
    error => error.code === 'STANDARD_EFFECTIVE_RANGE_CONFLICT'
  );
});


test('GC alias lookup preserves the requested work_type when resolving the canonical product', async () => {
  const query = async (sql, params = []) => {
    const text = String(sql).replace(/\s+/g, ' ').trim().toLowerCase();
    if (text.includes('from product_aliases')) return [{ product_code: 'QC3-2801' }];
    if (text.includes('from product_standards')) {
      const requestedProduct = String(params[1] || '').trim().toUpperCase();
      if (requestedProduct !== 'QC3-2801') return [];
      if (text.includes("upper(trim(ps.work_type))='lồng'")) {
        return [{ product_standard_id: 8801, product_code: 'QC3-2801', encoding_code: null, work_type: 'Lồng', standard_output: 180, exclude_kqd_from_tt: 0 }];
      }
      return [];
    }
    if (text.includes('from product_standard_versions')) return [];
    throw new Error(`Unexpected SQL: ${text}; params=${JSON.stringify(params)}`);
  };
  const resolver = createStandardResolver({ query });
  const resolved = await resolver.resolveProduct({
    processId: 1, productCode: '2801', workType: 'LONG', workDate: '2026-10-04'
  });
  assert.equal(resolved.productCode, 'QC3-2801');
  assert.equal(resolved.workType, 'LONG');
  assert.equal(resolved.standardOutput, 180);
});

test('GC alias mapping to multiple canonical products fails closed', async () => {
  const query = async (sql) => {
    const text = String(sql).replace(/\s+/g, ' ').trim().toLowerCase();
    if (text.includes('from machines')) return [{ id: 16, machine_code: 'ML4', gc_work_type: 'LONG', process_code: 'GC' }];
    if (text.includes('from product_aliases')) return [{ product_code: 'QC3-2801' }, { product_code: 'OTHER-2801' }];
    throw new Error(`Unexpected SQL: ${text}`);
  };
  const resolver = createStandardResolver({ query });
  await assert.rejects(
    resolver.resolveStandard({ processId: 1, productCode: '2801', machineCode: 'ML4', workDate: '2026-10-04' }),
    error => error.code === 'PRODUCT_ALIAS_CONFLICT'
  );
});
