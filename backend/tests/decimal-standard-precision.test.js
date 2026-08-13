const test = require('node:test');
const assert = require('node:assert/strict');
const { validateProductionReport } = require('../utils/reportValidation');
const { createStandardResolver } = require('../services/standardResolutionService');
const { createMachineLineValidator } = require('../services/machineLineValidationService');

function baseReport(standard) {
  return {
    work_date: new Date().toISOString().slice(0, 10), shift: 'A', machine_no: null, product_name: 'P1',
    total_time: 8, actual_time: 8, deduction_time: 0, standard_output: standard,
    actual_output: 100, tt_ok: 100, tt_ng: 0, defects: [], deductions: [], training_percent: 100
  };
}

for (const value of [617.1, 900.77, 1066.39, 309.76]) {
  test(`generic report validation preserves decimal standard ${value}`, () => {
    const result = validateProductionReport(baseReport(value));
    assert.equal(result.valid, true, JSON.stringify(result.errors));
    assert.equal(result.normalized.standard_output, value);
  });
}

test('authoritative report standard rejects zero, negative, NaN, Infinity and malformed strings', () => {
  for (const value of [0, -1, NaN, Infinity, 'abc']) {
    const result = validateProductionReport(baseReport(value));
    assert.equal(result.valid, false, `expected ${String(value)} invalid`);
    assert.ok(result.errors.standard_output, `missing standard_output error for ${String(value)}`);
  }
});

test('historical decimal boundary preserves value and version identity together', async () => {
  const query = async (sql, params = []) => {
    const text = String(sql).toLowerCase();
    if (text.includes('from product_standards')) return [{ product_standard_id: 1, product_code: 'P1' }];
    if (text.includes('from product_standard_versions')) return String(params[2]) === '2026-08-10'
      ? [{ id: 21, standard_output: 617.1, exclude_kqd_from_tt: 0, version_no: 1, effective_from: '2026-01-01', effective_to: '2026-08-10' }]
      : [{ id: 22, standard_output: 900.77, exclude_kqd_from_tt: 0, version_no: 2, effective_from: '2026-08-11', effective_to: null }];
    throw new Error(`Unexpected SQL ${text}`);
  };
  const resolver = createStandardResolver({ query });
  const v1 = await resolver.resolveStandard({ processId: 1, productCode: 'P1', workDate: '2026-08-10' });
  const v2 = await resolver.resolveStandard({ processId: 1, productCode: 'P1', workDate: '2026-08-11' });
  assert.deepEqual([v1.standardOutput, v1.standardVersionId], [617.1, 21]);
  assert.deepEqual([v2.standardOutput, v2.standardVersionId], [900.77, 22]);
});

test('machine historical decimals preserve 900.77 and 950.25', async () => {
  const query = async (sql, params = []) => {
    const text = String(sql).toLowerCase();
    if (text.includes('from product_standards')) return [{ product_standard_id: 1, product_code: 'P1' }];
    if (text.includes('from product_standard_versions')) return [{ id: 21, standard_output: 617.1, exclude_kqd_from_tt: 0, version_no: 1, effective_from: '2026-01-01', effective_to: null }];
    if (text.includes('from machines')) return [{ id: 9, machine_code: 'M1' }];
    if (text.includes('from product_machine_standards') && text.includes('effective_to')) return String(params[3]) === '2026-08-10'
      ? [{ id: 31, calculated_output_per_hour: 900.77, standard_output: 900.77, standard_time_seconds: 4, effective_from: '2026-01-01', effective_to: '2026-08-10' }]
      : [{ id: 32, calculated_output_per_hour: 950.25, standard_output: 950.25, standard_time_seconds: 3.8, effective_from: '2026-08-11', effective_to: null }];
    if (text.includes('from product_machine_standards')) return [{ id: 31 }];
    throw new Error(`Unexpected SQL ${text}`);
  };
  const resolver = createStandardResolver({ query });
  assert.equal((await resolver.resolveStandard({ processId:1, productCode:'P1', machineCode:'M1', workDate:'2026-08-10' })).standardOutput, 900.77);
  assert.equal((await resolver.resolveStandard({ processId:1, productCode:'P1', machineCode:'M1', workDate:'2026-08-11' })).standardOutput, 950.25);
});

test('capacity uses decimal standard before comparison and does not round 617.1 to 617', async () => {
  const validate = createMachineLineValidator({
    query: async (sql) => String(sql).toLowerCase().includes('from machines') ? [{ id: 1, machine_code: 'M1', is_automatic: 1, process_code: 'MAI' }] : [],
    standardResolver: { resolveStandard: async () => ({ productStandardId:1, standardVersionId:1, machineStandardId:1, productCode:'P1', standardOutput:617.1, excludeKqdFromTt:0, source:'MACHINE' }) }
  });
  const result = await validate({ processId:1, workDate:'2026-08-10', operationMode:'MACHINE', machineLines:[{ machine_code:'M1', product_code:'P1', machine_time_hours:8, ok_quantity:4936, ng_quantity:0, defects:[] }] });
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(result.lines[0].standard_output, 617.1);
  assert.equal(result.lines[0].maximum_output, 4936.8);
});

test('multi-machine lines preserve distinct decimal standards independently', async () => {
  const standards = { M1: 617.1, M2: 900.77 };
  const validate = createMachineLineValidator({
    query: async (sql, params) => String(sql).toLowerCase().includes('from machines') ? [{ id: String(params[1]).toUpperCase() === 'M1' ? 1 : 2, machine_code:String(params[1]).toUpperCase(), is_automatic:1, process_code:'MAI' }] : [],
    standardResolver: { resolveStandard: async ({ machineCode }) => ({ productStandardId:1, standardVersionId:1, machineStandardId: machineCode === 'M1' ? 11 : 12, productCode:'P1', standardOutput: standards[machineCode], excludeKqdFromTt:0, source:'MACHINE' }) }
  });
  const result = await validate({ processId:1, workDate:'2026-08-10', operationMode:'MACHINE', machineLines:[
    { machine_code:'M1', product_code:'P1', machine_time_hours:1, ok_quantity:600, ng_quantity:0, defects:[] },
    { machine_code:'M2', product_code:'P1', machine_time_hours:1, ok_quantity:800, ng_quantity:0, defects:[] }
  ]});
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.deepEqual(result.lines.map(line => line.standard_output), [617.1, 900.77]);
  assert.equal(result.totals.totalMaximum, 1517.87);
});
