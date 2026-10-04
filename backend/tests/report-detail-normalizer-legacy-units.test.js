const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeDeductions, mergeDefects } = require('../utils/reportDetailNormalizer');

test('legacy deduction columns stored as minutes are converted to DB hours', () => {
  const report = {
    deduction_time: 1.17,
    extra_data: JSON.stringify({
      columns: {
        'Chỉnh máy': 30,
        'Nghỉ giải lao': 40.2
      }
    })
  };
  const types = [
    { id: 10, deduction_code: 'CHINH_MAY', deduction_name: 'Chỉnh máy' },
    { id: 11, deduction_code: 'NGHI_GIAI_LAO', deduction_name: 'Nghỉ giải lao' }
  ];

  const details = normalizeDeductions([], report, [], types);
  assert.deepEqual(
    details.map((item) => [item.deduction_name, Number(item.hours.toFixed(4))]),
    [['Chỉnh máy', 0.5], ['Nghỉ giải lao', 0.67]]
  );
  assert.equal(Number(details.reduce((sum, item) => sum + item.hours, 0).toFixed(2)), 1.17);
});

test('legacy deduction columns already stored as hours are kept as hours', () => {
  const report = {
    deduction_time: 1.17,
    extra_data: { columns: { 'Chỉnh máy': 0.5, 'Nghỉ giải lao': 0.67 } }
  };
  const types = [
    { id: 10, code: 'CHINH_MAY', deduction_code: 'CHINH_MAY', name: 'Chỉnh máy', deduction_name: 'Chỉnh máy' },
    { id: 11, code: 'NGHI_GIAI_LAO', deduction_code: 'NGHI_GIAI_LAO', name: 'Nghỉ giải lao', deduction_name: 'Nghỉ giải lao' }
  ];
  const details = normalizeDeductions([], report, [], types);
  assert.equal(Number(details.reduce((sum, item) => sum + item.hours, 0).toFixed(2)), 1.17);
});

test('legacy aggregate NG fields recover detail when approved child rows are empty or incomplete', () => {
  const report = {
    tt_ng: 3,
    kqd_dap_lai: 1,
    vo_do_long: 2
  };
  const details = mergeDefects(report, [], []);
  assert.deepEqual(
    details.map((item) => [item.defect_code, item.quantity]).sort(),
    [['KQD', 1], ['VO_CAO_SU', 2]]
  );
});

test('legacy aggregate NG fields win when child detail total does not match parent NG', () => {
  const report = {
    tt_ng: 3,
    kqd_dap_lai: 1,
    vo_do_long: 2
  };
  const child = [{ defect_type_id: 999, defect_code: 'OTHER', defect_name: 'Other', quantity: 1 }];
  const details = mergeDefects(report, child, []);
  assert.equal(details.reduce((sum, item) => sum + item.quantity, 0), 3);
  assert.ok(details.some((item) => item.defect_code === 'KQD' && item.quantity === 1));
  assert.ok(details.some((item) => item.defect_code === 'VO_CAO_SU' && item.quantity === 2));
});

console.log('[PASS] report detail normalizer: legacy minutes/hours + NG aggregate recovery');