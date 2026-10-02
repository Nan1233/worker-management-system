'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { canonicalDefect, mergeDefects } = require('../utils/reportDetailNormalizer');

test('GC FE/DB codes are preserved instead of CAT/LONG legacy codes', () => {
  assert.equal(canonicalDefect({ defect_type_id: 101, defect_code: 'CUT_1', defect_name: 'Cao su không đứt', quantity: 3 }).defect_code, 'CUT_1');
  assert.equal(canonicalDefect({ defect_type_id: 110, defect_code: 'CUT_10', defect_name: 'Khác', quantity: 2 }).defect_code, 'CUT_10');
  assert.equal(canonicalDefect({ defect_type_id: 118, defect_code: 'LONG_8', defect_name: 'Khác', quantity: 4 }).defect_code, 'LONG_8');
  assert.equal(canonicalDefect({ defect_type_id: 119, defect_code: 'XOAY', defect_name: 'Cao su xoay', quantity: 1 }).defect_code, 'XOAY');
});

test('legacy CAT/LONG aliases translate to the real FE/DB codes', () => {
  assert.equal(canonicalDefect({ defect_code: 'CAT01', quantity: 3 }).defect_code, 'CUT_1');
  assert.equal(canonicalDefect({ defect_code: 'CAT10', quantity: 2 }).defect_code, 'CUT_10');
  assert.equal(canonicalDefect({ defect_code: 'LONG08', quantity: 4 }).defect_code, 'LONG_8');
});

test('duplicate display names do not collapse when type ids/codes differ', () => {
  const merged = mergeDefects({}, [
    { defect_type_id: 110, defect_code: 'CUT_10', defect_name: 'Khác', quantity: 2 },
    { defect_type_id: 118, defect_code: 'LONG_8', defect_name: 'Khác', quantity: 4 },
    { defect_type_id: 117, defect_code: 'LONG_7', defect_name: 'Lẫn cao su', quantity: 5 },
    { defect_type_id: 109, defect_code: 'CUT_9', defect_name: 'Lẫn cao su', quantity: 6 }
  ]);

  assert.deepEqual(
    merged.map((x) => [x.defect_code, x.quantity]).sort(),
    [['CUT_10', 2], ['CUT_9', 6], ['LONG_7', 5], ['LONG_8', 4]].sort()
  );
});
