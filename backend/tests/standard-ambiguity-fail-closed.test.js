'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createStandardResolver } = require('../services/standardResolutionService');

const report = {
  processId: 1,
  productCode: 'PART-1',
  workDate: '2026-10-21',
  workType: 'Cắt'
};

function buildResolver({ products = [], machineStandards = [] } = {}) {
  return createStandardResolver({
    query: async (sql, params = []) => {
      const query = String(sql);
      if (/FROM machines m JOIN processes p/i.test(query)) {
        return [{ id: 13, machine_code: 'C13', process_code: 'GC', gc_work_type: 'CUT' }];
      }
      if (/FROM product_machine_standards/i.test(query)) {
        return machineStandards.filter((row) =>
          Number(row.machine_id) === Number(params[1]) &&
          String(row.product_code) === String(params[2]) &&
          (!row.effective_from || row.effective_from <= params[3]) &&
          (!row.effective_to || row.effective_to >= params[4])
        );
      }
      if (/FROM product_standards ps/i.test(query)) {
        const isCut = query.includes("('CẮT','CAT','CUT')");
        const isLong = query.includes("('LỒNG','LONG')");
        const matchingWorkType = (row) => {
          if (isCut) return ['CẮT', 'CAT', 'CUT'].includes(String(row.work_type).toUpperCase());
          if (isLong) return ['LỒNG', 'LONG'].includes(String(row.work_type).toUpperCase());
          return true;
        };
        if (/BINARY TRIM\(product_code\)/i.test(query)) {
          return products.filter((row) => row.product_code === params[1] && matchingWorkType(row)).slice(0, 2);
        }
        if (/BINARY TRIM\(encoding_code\)/i.test(query)) {
          return products.filter((row) => row.encoding_code === params[1] && matchingWorkType(row)).slice(0, 2);
        }
        return [];
      }
      if (/FROM product_standard_versions/i.test(query)) return [];
      throw new Error('Unexpected SQL: ' + query);
    }
  });
}

const productRow = (id, output = 360) => ({
  product_standard_id: id, product_code: 'PART-1',
  encoding_code: null, work_type: 'Cắt', standard_output: output
});

const machineRow = (id, active, output = 360) => ({
  id, process_id: 1, machine_id: 13, product_code: 'PART-1',
  is_active: active, standard_output: output, calculated_output_per_hour: output,
  effective_from: '2026-01-01', effective_to: null
});

test('duplicate product standards with the SAME output are still ambiguous and fail closed', async () => {
  const resolver = buildResolver({ products: [productRow(1), productRow(2)] });
  await assert.rejects(resolver.resolveProduct(report), (e) => {
    assert.equal(e.code, 'STANDARD_EFFECTIVE_RANGE_CONFLICT');
    assert.deepEqual(e.details.conflicting_standard_ids, [1, 2]);
    return true;
  });
});

test('one product standard is accepted normally', async () => {
  const result = await buildResolver({ products: [productRow(1)] }).resolveProduct(report);
  assert.equal(result.productStandardId, 1);
  assert.equal(result.standardOutput, 360);
});

test('machine standards overlapping on work_date fail closed even if one has is_active=0', async () => {
  const resolver = buildResolver({ machineStandards: [machineRow(11, 1), machineRow(12, 0)] });
  await assert.rejects(resolver.resolveStandard({ ...report, machineCode: 'C13' }), (e) => {
    assert.equal(e.code, 'STANDARD_EFFECTIVE_RANGE_CONFLICT');
    return true;
  });
});

test('one historical inactive machine standard is still usable for its valid work_date', async () => {
  const resolver = buildResolver({ machineStandards: [machineRow(12, 0)] });
  const result = await resolver.resolveStandard({ ...report, machineCode: 'C13' });
  assert.equal(result.machineStandardId, 12);
  assert.equal(result.standardOutput, 360);
  assert.equal(result.source, 'MACHINE_HISTORICAL');
});

test('machine standard outside effective range falls back to unambiguous product standard', async () => {
  const resolver = buildResolver({
    products: [productRow(1)],
    machineStandards: [{ ...machineRow(12, 0), effective_to: '2026-09-30' }]
  });
  const result = await resolver.resolveStandard({ ...report, machineCode: 'C13' });
  assert.equal(result.productStandardId, 1);
  assert.equal(result.machineStandardId, null);
});
