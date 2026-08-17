const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createStandardResolver,
  assertStandardSnapshotConsistency
} = require('../services/standardResolutionService');

function createFixtureQuery({ overlap = false, missing = false, machine = false } = {}) {
  const productVersions = missing ? [] : [
    { id: 11, process_id: 1, product_code: 'P1', standard_output: overlap ? 100 : 100, exclude_kqd_from_tt: 0, version_no: 1, effective_from: '2026-01-01', effective_to: '2026-08-10' },
    { id: 12, process_id: 1, product_code: 'P1', standard_output: 120, exclude_kqd_from_tt: 0, version_no: 2, effective_from: '2026-08-11', effective_to: null }
  ];
  if (overlap) productVersions.push({ id: 13, process_id: 1, product_code: 'P1', standard_output: 105, exclude_kqd_from_tt: 0, version_no: 3, effective_from: '2026-08-01', effective_to: '2026-08-15' });

  const machineStandards = machine ? [
    { id: 41, standard_output: 900.77, calculated_output_per_hour: 900.77, standard_time_seconds: 4, effective_from: '2026-01-01', effective_to: '2026-08-10' },
    { id: 42, standard_output: 950.25, calculated_output_per_hour: 950.25, standard_time_seconds: 3.8, effective_from: '2026-08-11', effective_to: null }
  ] : [];

  return async (sql, params = []) => {
    const text = String(sql).replace(/\s+/g, ' ').trim().toLowerCase();
    if (text.includes('from product_standards')) return [{ product_standard_id: 101, product_code: 'P1' }];
    if (text.includes('from product_standard_versions')) {
      const date = String(params[2]);
      return productVersions.filter((row) => row.effective_from <= date && (!row.effective_to || row.effective_to >= date));
    }
    if (text.includes('from machines')) return [{ id: 201, machine_code: 'M1' }];
    if (text.includes('from product_machine_standards') && text.includes('effective_to')) {
      const date = String(params[3]);
      return machineStandards.filter((row) => (!row.effective_from || row.effective_from <= date) && (!row.effective_to || row.effective_to >= date));
    }
    if (text.includes('from product_machine_standards')) return machineStandards.length ? [{ id: machineStandards[0].id }] : [];
    throw new Error(`Unhandled test SQL: ${text}; params=${JSON.stringify(params)}`);
  };
}

test('historical product standard resolves strictly by work_date boundary', async () => {
  const resolver = createStandardResolver({ query: createFixtureQuery() });
  const v1 = await resolver.resolveStandard({ processId: 1, productCode: 'P1', workDate: '2026-08-10' });
  const v2 = await resolver.resolveStandard({ processId: 1, productCode: 'P1', workDate: '2026-08-11' });
  assert.equal(v1.standardOutput, 100);
  assert.equal(v1.standardVersionId, 11);
  assert.equal(v2.standardOutput, 120);
  assert.equal(v2.standardVersionId, 12);
});

test('resolver is submit-date independent and rejected/resubmitted report keeps old work_date standard', async () => {
  const resolver = createStandardResolver({ query: createFixtureQuery() });
  const originalWorkDate = '2026-08-10';
  const createdOn = '2026-08-12';
  const editedOn = '2026-08-20';
  assert.notEqual(createdOn, originalWorkDate);
  assert.notEqual(editedOn, originalWorkDate);
  const afterResubmit = await resolver.resolveStandard({ processId: 1, productCode: 'P1', workDate: originalWorkDate });
  assert.equal(afterResubmit.standardOutput, 100);
  assert.equal(afterResubmit.standardVersionId, 11);
  const changedDate = await resolver.resolveStandard({ processId: 1, productCode: 'P1', workDate: '2026-08-11' });
  assert.equal(changedDate.standardOutput, 120);
  assert.equal(changedDate.standardVersionId, 12);
});

test('missing historical product standard fails closed', async () => {
  const resolver = createStandardResolver({ query: createFixtureQuery({ missing: true }) });
  await assert.rejects(
    () => resolver.resolveStandard({ processId: 1, productCode: 'P1', workDate: '2026-08-10' }),
    (error) => error.code === 'HISTORICAL_STANDARD_NOT_FOUND' && error.status === 422
  );
});

test('overlapping historical product standards fail closed instead of choosing arbitrary row', async () => {
  const resolver = createStandardResolver({ query: createFixtureQuery({ overlap: true }) });
  await assert.rejects(
    () => resolver.resolveStandard({ processId: 1, productCode: 'P1', workDate: '2026-08-10' }),
    (error) => error.code === 'STANDARD_EFFECTIVE_RANGE_CONFLICT'
  );
});

test('historical machine standard resolves by same report work_date and preserves decimal values', async () => {
  const resolver = createStandardResolver({ query: createFixtureQuery({ machine: true }) });
  const v1 = await resolver.resolveStandard({ processId: 1, productCode: 'P1', machineCode: 'M1', workDate: '2026-08-10' });
  const v2 = await resolver.resolveStandard({ processId: 1, productCode: 'P1', machineCode: 'M1', workDate: '2026-08-11' });
  assert.equal(v1.standardOutput, 900.77);
  assert.equal(v1.machineStandardId, 41);
  assert.equal(v2.standardOutput, 950.25);
  assert.equal(v2.machineStandardId, 42);
});

test('snapshot consistency rejects a value/version mismatch', () => {
  const resolved = { standardOutput: 100, standardVersionId: 11, machineStandardId: null };
  assert.equal(assertStandardSnapshotConsistency({ resolved, standardOutput: 100, standardVersionId: 11 }), true);
  assert.throws(
    () => assertStandardSnapshotConsistency({ resolved, standardOutput: 120, standardVersionId: 11 }),
    (error) => error.code === 'STANDARD_SNAPSHOT_MISMATCH'
  );
});

test('minimal decimal preservation in historical resolver keeps 617.1 and 900.77 exactly', async () => {
  const query = async (sql, params = []) => {
    const text = String(sql).toLowerCase();
    if (text.includes('from product_standards')) return [{ product_standard_id: 1, product_code: 'D' }];
    if (text.includes('from product_standard_versions')) {
      return String(params[2]) === '2026-08-10'
        ? [{ id: 21, standard_output: 617.1, exclude_kqd_from_tt: 0, version_no: 1, effective_from: '2026-01-01', effective_to: '2026-08-10' }]
        : [{ id: 22, standard_output: 900.77, exclude_kqd_from_tt: 0, version_no: 2, effective_from: '2026-08-11', effective_to: null }];
    }
    throw new Error('Unexpected SQL');
  };
  const resolver = createStandardResolver({ query });
  assert.equal((await resolver.resolveStandard({ processId:1, productCode:'D', workDate:'2026-08-10' })).standardOutput, 617.1);
  assert.equal((await resolver.resolveStandard({ processId:1, productCode:'D', workDate:'2026-08-11' })).standardOutput, 900.77);
});

test('write-side effective-range validator rejects overlap', async () => {
  const query = async (sql) => {
    if (String(sql).toLowerCase().includes('from product_standard_versions')) return [{ id: 88 }];
    throw new Error('Unexpected SQL');
  };
  const resolver = createStandardResolver({ query });
  await assert.rejects(
    () => resolver.validateProductVersionRange({ processId:1, productCode:'P1', effectiveFrom:'2026-08-10', effectiveTo:'2026-08-20' }),
    (error) => error.code === 'STANDARD_EFFECTIVE_RANGE_CONFLICT'
  );
});

test('legacy active product standard resolves without migration when no historical version is available', async () => {
  const resolverPath = require.resolve('../services/standardResolutionService');
  delete require.cache[resolverPath];
  const { createStandardResolver } = require('../services/standardResolutionService');
  const calls = [];
  const query = async (sql, params) => {
    calls.push({ sql, params });
    const normalized = String(sql).toLowerCase();
    if (normalized.includes('from product_standards')) {
      return [{
        product_standard_id: 108,
        product_code: '1080-17',
        standard_output: '617.1',
        exclude_kqd_from_tt: 0
      }];
    }
    if (normalized.includes('from product_standard_versions')) return [];
    return [];
  };
  const resolver = createStandardResolver({ query });
  const resolved = await resolver.resolveProduct({ processId: 2, productCode: '1080-17', workDate: '2026-08-17' });
  assert.equal(resolved.standardOutput, 617.1);
  assert.equal(resolved.productStandardId, 108);
  assert.equal(resolved.standardVersionId, null);
  assert.equal(resolved.source, 'LEGACY_PRODUCT_STANDARD');
  assert.equal(resolved.historicalVersionAvailable, false);
  assert.ok(calls.some((call) => String(call.sql).includes('FROM product_standard_versions')));
});

