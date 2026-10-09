// Worker nhập "Thời gian chạy thực tế" + "Thời gian trừ" cho mỗi dòng máy GC.
// "Tổng thời gian" (machine_time_hours, lưu DB với ý nghĩa gross không đổi) không còn
// là input trực tiếp: backend luôn tự tính = thực tế + trừ, không tin tưởng giá trị
// machine_time_hours thô do client gửi lên. Xem machineLineValidationService.js.
const test = require('node:test');
const assert = require('node:assert/strict');

const { createMachineLineValidator } = require('../services/machineLineValidationService');

const machines = [
  { id: 101, process_id: 1, machine_code: 'CAT-01', status: 'active' }
];

const products = [
  {
    id: 201, machine_id: 101, process_id: 1, product_code: 'QC5-1657', status: 'active',
    default_standard_output: 100, machine_standard_output: 100, standard_time_seconds: 36, exclude_kqd_from_tt: 0
  }
];

const deductionTypes = [
  { id: 701, process_id: 1, deduction_code: 'CHO_HANG', deduction_name: 'Chờ hàng', status: 'active' },
  { id: 702, process_id: 1, deduction_code: 'CHINH_MAY', deduction_name: 'Chỉnh máy', status: 'active' }
];

const createQueryMock = () => async (sql, params = []) => {
  const normalizedSql = String(sql).replace(/\s+/g, ' ').trim().toLowerCase();

  if (normalizedSql.includes('from machines')) {
    const processId = Number(params[0]);
    return machines.filter((m) => m.process_id === processId && m.status === 'active').map(({ id, machine_code }) => ({ id, machine_code }));
  }
  if (normalizedSql.includes('from deduction_types')) {
    const processId = Number(params[0]);
    return deductionTypes.filter((d) => d.process_id === processId && d.status === 'active');
  }
  if (normalizedSql.includes('from defect_types')) {
    return [];
  }
  throw new Error(`Test query chưa được mock: ${normalizedSql}`);
};

const validate = createMachineLineValidator({
  query: createQueryMock(),
  standardResolver: {
    resolveStandard: async ({ processId, productCode, machineId, machineCode }) => {
      const product = products.find((p) => p.process_id === processId && p.machine_id === machineId && p.product_code === productCode);
      if (!product) throw new Error('Không có định mức test');
      return {
        productStandardId: product.id, standardVersionId: 301, machineStandardId: 401,
        productCode: product.product_code, machineId, machineCode, standardOutput: product.machine_standard_output,
        standardTimeSeconds: product.standard_time_seconds, excludeKqdFromTt: product.exclude_kqd_from_tt, source: 'MACHINE'
      };
    }
  }
});

const baseLine = (overrides = {}) => ({
  machine_code: 'CAT-01',
  product_code: 'QC5-1657',
  ok_quantity: 50,
  ng_quantity: 0,
  defects: [],
  ...overrides
});

test('actual_time_hours + deduction are accepted and machine_time_hours is derived as their sum', async () => {
  const result = await validate({
    processId: 1,
    workDate: '2026-08-10',
    machineLines: [baseLine({
      actual_time_hours: 7.5,
      deductions: [{ deduction_code: 'CHO_HANG', hours: 1 }]
    })]
  });

  assert.equal(result.valid, true, JSON.stringify(result.errors));
  const line = result.lines[0];
  assert.equal(line.actual_time_hours, 7.5);
  assert.equal(line.deduction_time_hours, 1);
  // Tổng thời gian = thực tế + trừ, không nhận trực tiếp từ client.
  assert.equal(line.machine_time_hours, 8.5);
  assert.equal(line.deductions.length, 1);
  assert.equal(line.deductions[0].deduction_type_id, 701);
});

test('a spoofed machine_time_hours in the payload is ignored; server always recomputes actual + deduction', async () => {
  const result = await validate({
    processId: 1,
    workDate: '2026-08-10',
    machineLines: [baseLine({
      actual_time_hours: 2,
      deductions: [{ deduction_code: 'CHO_HANG', hours: 1 }],
      // Worker/response giả mạo cố gắng gửi tổng thời gian trực tiếp = 11 (gian lận).
      machine_time_hours: 11
    })]
  });

  assert.equal(result.valid, true, JSON.stringify(result.errors));
  // 2 + 1 = 3, không phải 11 dù client gửi machine_time_hours=11.
  assert.equal(result.lines[0].machine_time_hours, 3);
});

test('actual_time_hours = 0 is rejected (Worker must enter a positive actual running time)', async () => {
  const result = await validate({
    processId: 1,
    workDate: '2026-08-10',
    machineLines: [baseLine({ actual_time_hours: 0, deductions: [] })]
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors['machine_lines.0.actual_time_hours']);
});

test('negative actual_time_hours is rejected', async () => {
  const result = await validate({
    processId: 1,
    workDate: '2026-08-10',
    machineLines: [baseLine({ actual_time_hours: -1, deductions: [] })]
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors['machine_lines.0.actual_time_hours']);
});

test('actual_time_hours above 12 is rejected even when deduction is 0', async () => {
  const result = await validate({
    processId: 1,
    workDate: '2026-08-10',
    machineLines: [baseLine({ actual_time_hours: 12.5, deductions: [] })]
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors['machine_lines.0.actual_time_hours']);
});

test('total (actual + deduction) above 12 hours is rejected even though actual alone is <= 12', async () => {
  const result = await validate({
    processId: 1,
    workDate: '2026-08-10',
    machineLines: [baseLine({
      actual_time_hours: 11,
      deductions: [{ deduction_code: 'CHO_HANG', hours: 2 }]
    })]
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors['machine_lines.0.machine_time_hours']);
});

test('hours/minutes convert correctly: 7h30 actual + 1h deduction totals 8h30 (8.5h)', async () => {
  const hours = 7, minutes = 30;
  const actualTimeHours = hours + minutes / 60;
  const result = await validate({
    processId: 1,
    workDate: '2026-08-10',
    machineLines: [baseLine({
      actual_time_hours: actualTimeHours,
      deductions: [{ deduction_code: 'CHO_HANG', hours: 1 }]
    })]
  });
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(result.lines[0].machine_time_hours, 8.5);
});

test('an unresolvable deduction type is rejected instead of silently dropped', async () => {
  const result = await validate({
    processId: 1,
    workDate: '2026-08-10',
    machineLines: [baseLine({
      actual_time_hours: 5,
      deductions: [{ deduction_code: 'KHONG_TON_TAI', hours: 1 }]
    })]
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors['machine_lines.0.deductions']);
});

test('legacy payload without actual_time_hours still works: machine_time_hours is treated as the legacy gross value', async () => {
  // Client cũ (hoặc dữ liệu lịch sử re-validate) không gửi actual_time_hours, chỉ gửi
  // machine_time_hours như một tổng đã biết. Backend fallback: thực tế = tổng - trừ.
  const result = await validate({
    processId: 1,
    workDate: '2026-08-10',
    machineLines: [baseLine({
      machine_time_hours: 8,
      deductions: [{ deduction_code: 'CHO_HANG', hours: 1 }]
    })]
  });
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(result.lines[0].actual_time_hours, 7);
  assert.equal(result.lines[0].machine_time_hours, 8);
});

test('re-validating a stored line (deductions_json instead of deductions array) still recovers the deduction amount', async () => {
  // productionTempUpdateModel.js có thể truyền lại dòng máy đã lưu trong DB (shape từ
  // SELECT ml.*: deductions_json, không phải mảng deductions) khi payload không gửi
  // lại machine_lines. Đảm bảo deduction không bị mất trong trường hợp này.
  const result = await validate({
    processId: 1,
    workDate: '2026-08-10',
    machineLines: [baseLine({
      machine_time_hours: 8,
      deduction_time_hours: 1,
      deductions_json: JSON.stringify([{ deduction_type_id: 701, deduction_code: 'CHO_HANG', deduction_name: 'Chờ hàng', hours: 1 }])
    })]
  });
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(result.lines[0].deduction_time_hours, 1);
  assert.equal(result.lines[0].actual_time_hours, 7);
  assert.equal(result.lines[0].machine_time_hours, 8);
});

test('multiple deduction types on one line sum correctly into deduction_time_hours and machine_time_hours', async () => {
  const result = await validate({
    processId: 1,
    workDate: '2026-08-10',
    machineLines: [baseLine({
      actual_time_hours: 6,
      deductions: [
        { deduction_code: 'CHO_HANG', hours: 0.5 },
        { deduction_code: 'CHINH_MAY', hours: 0.25 }
      ]
    })]
  });
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(result.lines[0].deduction_time_hours, 0.75);
  assert.equal(result.lines[0].machine_time_hours, 6.75);
  assert.equal(result.lines[0].deductions.length, 2);
});
