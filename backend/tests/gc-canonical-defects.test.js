const test = require('node:test');
const assert = require('node:assert/strict');
const { mergeDefects, CANONICAL_GC_DEFECTS } = require('../utils/reportDetailNormalizer');

test('GC canonical master contains all FE defect codes', () => {
  assert.equal(CANONICAL_GC_DEFECTS.size, 19);
  for (const code of ['CAT01','CAT02','CAT03','CAT04','CAT05','CAT06','CAT07','CAT08','CAT09','CAT10','LONG01','LONG02','LONG03','LONG04','LONG05','LONG06','LONG07','LONG08','XOAY']) {
    assert.equal(CANONICAL_GC_DEFECTS.has(code), true, code);
  }
});

test('legacy GC fields normalize to FE canonical codes', () => {
  const result = mergeDefects({
    kqd_dap_lai: 10,
    khong_dut: 2,
    cat_lem: 3,
    bavia_hut: 4,
    ppcm: 5,
    xoay: 6
  });
  const byCode = Object.fromEntries(result.map(item => [item.defect_code, item.quantity]));
  assert.equal(byCode.CAT01, 12);
  assert.equal(byCode.CAT02, 3);
  assert.equal(byCode.CAT06, 4);
  assert.equal(byCode.CAT07, 5);
  assert.equal(byCode.XOAY, 6);
});

test('persisted canonical rows take precedence over legacy fields', () => {
  const result = mergeDefects({ kqd_dap_lai: 999 }, [{ defect_type_id: 101, defect_code: 'CAT02', defect_name: 'Cắt lẹm', quantity: 7 }]);
  assert.deepEqual(result.map(item => [item.defect_code, item.quantity]), [['CAT02', 7]]);
});
