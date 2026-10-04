const test = require('node:test');
const assert = require('node:assert/strict');
const {
  mergeDefects,
  normalizeDeductions,
} = require('../utils/reportDetailNormalizer');

test('legacy approved report NG columns are exported as detail when child rows are empty', () => {
  const report = {
    source_temp_id: -123,
    operation_mode: 'MACHINE',
    kqd_dap_lai: 4,
    vo_do_long: 3,
    xuoc_do_long: 2,
    cong_gay: 1,
    cat_lem: 5,
  };

  const details = mergeDefects(report, [], []);
  const byCode = new Map(details.map((item) => [item.defect_code, item.quantity]));

  assert.equal(byCode.get('KQD'), 4);
  assert.equal(byCode.get('VO_CAO_SU'), 3);
  assert.equal(byCode.get('K_XUOC_CONG_GAY'), 3);
  assert.equal(byCode.get('CAT_LEM'), 5);
});

test('legacy extra_data.columns are exported as deduction detail when child rows are empty', () => {
  const report = {
    source_temp_id: -456,
    deduction_time: 3.75,
    extra_data: JSON.stringify({
      columns: {
        'Thiếu sản lượng': 1.25,
        'Chuyển mã': '0.50',
        'Nghỉ giải lao': 2,
        'Không phải cột trừ giờ': 99,
      },
    }),
  };

  const deductionTypes = [
    { id: 1, process_id: 10, deduction_code: 'THIEU_SAN_LUONG', deduction_name: 'Thiếu sản lượng' },
    { id: 2, process_id: 10, deduction_code: 'CHUYEN_MA', deduction_name: 'Chuyển mã' },
    { id: 3, process_id: 10, deduction_code: 'NGHI_GIAI_LAO', deduction_name: 'Nghỉ giải lao' },
  ];

  const details = normalizeDeductions([], report, [], deductionTypes);
  const byId = new Map(details.map((item) => [Number(item.deduction_type_id), item.hours]));

  assert.equal(byId.get(1), 1.25);
  assert.equal(byId.get(2), 0.5);
  assert.equal(byId.get(3), 2);
  assert.equal(details.length, 3);
});

test('persisted child details remain authoritative over legacy fallback', () => {
  const report = {
    kqd_dap_lai: 99,
    deduction_time: 9,
    extra_data: JSON.stringify({ columns: { 'Chuyển mã': 9 } }),
  };
  const defects = mergeDefects(report, [{ defect_type_id: 7, defect_code: 'X', defect_name: 'X', quantity: 2 }], []);
  const deductions = normalizeDeductions(
    [{ deduction_type_id: 8, deduction_code: 'Y', deduction_name: 'Y', hours: 1.5 }],
    report,
    [],
    [{ id: 8, deduction_code: 'Y', deduction_name: 'Y' }],
  );

  assert.equal(defects.length, 1);
  assert.equal(defects[0].quantity, 2);
  assert.equal(deductions.length, 1);
  assert.equal(deductions[0].hours, 1.5);
});
