const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createMachineLineValidator
} = require('../services/machineLineValidationService');

const machines = [
  { id: 101, process_id: 1, machine_code: 'CAT-01', status: 'active' },
  { id: 102, process_id: 1, machine_code: 'CAT-02', status: 'active' }
];

const products = [
  {
    id: 201,
    machine_id: 101,
    process_id: 1,
    product_code: 'QC5-1657',
    status: 'active',
    default_standard_output: 100,
    machine_standard_output: 100,
    standard_time_seconds: 36,
    exclude_kqd_from_tt: 1
  },
  {
    id: 202,
    machine_id: 102,
    process_id: 1,
    product_code: 'QC5-1657',
    status: 'active',
    default_standard_output: 100,
    machine_standard_output: 100,
    standard_time_seconds: 36,
    exclude_kqd_from_tt: 1
  }
];


const defectTypes = [
  { id: 501, process_id: 1, defect_code: 'KQD', defect_name: 'KQD', status: 'active' },
  { id: 502, process_id: 1, defect_code: 'BAVIA', defect_name: 'Bavia', status: 'active' },
  { id: 503, process_id: 1, defect_code: 'KQD_TEST', defect_name: 'KQD test chưa cấu hình', status: 'active' }
];

const createQueryMock = () => async (sql, params = []) => {
  const normalizedSql = String(sql).replace(/\s+/g, ' ').trim().toLowerCase();

  if (normalizedSql.includes('from machines')) {
    const processId = Number(params[0]);
    const machineCode = String(params[1] || '').trim().toUpperCase();

    return machines
      .filter((machine) => (
        Number(machine.process_id) === processId
        && String(machine.machine_code).trim().toUpperCase() === machineCode
        && String(machine.status).toLowerCase() === 'active'
      ))
      .map(({ id, machine_code }) => ({ id, machine_code }));
  }

  if (normalizedSql.includes('from defect_types')) {
    const processId = Number(params[0]);
    if (normalizedSql.includes('and id=?')) {
      const id = Number(params[1]);
      return defectTypes.filter((item) => item.process_id === processId && item.id === id && item.status === 'active');
    }
    const code = String(params[1] || '').trim().toUpperCase();
    return defectTypes.filter((item) => item.process_id === processId && item.defect_code === code && item.status === 'active');
  }

  if (normalizedSql.includes('from product_standards')) {
    const machineId = Number(params[0]);
    const processId = Number(params[1]);
    const productCode = String(params[2] || '').trim().toUpperCase();

    return products
      .filter((product) => (
        Number(product.machine_id) === machineId
        && Number(product.process_id) === processId
        && String(product.product_code).trim().toUpperCase() === productCode
        && String(product.status).toLowerCase() === 'active'
      ))
      .map((product) => ({
        id: product.id,
        product_code: product.product_code,
        default_standard_output: product.default_standard_output,
        machine_standard_output: product.machine_standard_output,
        standard_time_seconds: product.standard_time_seconds,
        exclude_kqd_from_tt: product.exclude_kqd_from_tt
      }));
  }

  throw new Error(`Test query chưa được mock: ${normalizedSql}; params=${JSON.stringify(params)}`);
};

const validate = createMachineLineValidator({
  query: createQueryMock(),
  standardResolver: {
    resolveStandard: async ({ processId, productCode, machineId, machineCode, workDate }) => {
      assert.equal(workDate, '2026-08-10');
      const product = products.find((item) => Number(item.process_id) === Number(processId) && Number(item.machine_id) === Number(machineId) && item.product_code === productCode);
      if (!product) throw new Error('Không có định mức test');
      return {
        productStandardId: product.id, standardVersionId: 301, machineStandardId: 401 + Number(machineId),
        productCode: product.product_code, machineId, machineCode, standardOutput: product.machine_standard_output,
        standardTimeSeconds: product.standard_time_seconds, excludeKqdFromTt: product.exclude_kqd_from_tt, source: 'MACHINE'
      };
    }
  }
});

test('multi-machine line validates DB master data, NG detail and KQD exclusion', async () => {
  const result = await validate({
    processId: 1,
    workDate: '2026-08-10',
    operationMode: 'MACHINE',
    maxMachines: 4,
    machineLines: [
      {
        machine_code: 'CAT-01',
        product_code: 'QC5-1657',
        machine_time_hours: 1,
        ok_quantity: 90,
        ng_quantity: 10,
        defects: [
          { defect_code: 'KQD', defect_name: 'KQD', quantity: 2 },
          { defect_code: 'BAVIA', defect_name: 'Bavia', quantity: 8 }
        ]
      }
    ]
  });

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, {});
  assert.equal(result.lines.length, 1);
  assert.equal(result.lines[0].machine_id, 101);
  assert.equal(result.lines[0].standard_output, 100);
  assert.equal(result.lines[0].counted_output, 98);
  assert.equal(result.lines[0].earned_standard_hours, 0.98);
  assert.equal(result.totals.totalOk, 90);
  assert.equal(result.totals.totalNg, 10);
  assert.equal(result.totals.totalCounted, 98);
});

test('multi-machine line rejects duplicate machine and mismatched NG', async () => {
  const duplicate = await validate({
    processId: 1,
    workDate: '2026-08-10',
    operationMode: 'MACHINE',
    machineLines: [
      {
        machine_code: 'CAT-01',
        product_code: 'QC5-1657',
        machine_time_hours: 1,
        ok_quantity: 10,
        ng_quantity: 0,
        defects: []
      },
      {
        machine_code: 'cat-01',
        product_code: 'QC5-1657',
        machine_time_hours: 1,
        ok_quantity: 10,
        ng_quantity: 0,
        defects: []
      }
    ]
  });

  assert.equal(duplicate.valid, false);
  assert.equal(duplicate.errors.machine_lines, 'Không được chọn trùng máy');

  const mismatchedNg = await validate({
    processId: 1,
    workDate: '2026-08-10',
    operationMode: 'MACHINE',
    machineLines: [
      {
        machine_code: 'CAT-01',
        product_code: 'QC5-1657',
        machine_time_hours: 1,
        ok_quantity: 90,
        ng_quantity: 10,
        defects: [{ defect_code: 'BAVIA', defect_name: 'Bavia', quantity: 9 }]
      }
    ]
  });

  assert.equal(mismatchedNg.valid, false);
  assert.match(mismatchedNg.errors['machine_lines.0.defects'], /phải bằng tổng chi tiết lỗi NG/);
});

test('unconfigured KQD-like machine defect is counted normally', async () => {
  const result = await validate({
    processId: 1,
    workDate: '2026-08-10',
    operationMode: 'MACHINE',
    maxMachines: 4,
    machineLines: [{
      machine_code: 'CAT-01',
      product_code: 'QC5-1657',
      machine_time_hours: 1,
      ok_quantity: 90,
      ng_quantity: 10,
      defects: [
        { defect_code: 'KQD_TEST', defect_name: 'KQD test chưa cấu hình', quantity: 4 },
        { defect_code: 'BAVIA', defect_name: 'Bavia', quantity: 6 }
      ]
    }]
  });
  assert.equal(result.valid, true);
  assert.equal(result.lines[0].counted_output, 100);
});
