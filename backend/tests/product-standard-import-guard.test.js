'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { decideStandardImport } = require('../services/productStandardImportGuard');

const payload = { process_id: 1, product_code: '1080', work_type: 'Lồng', standard_output: 660, exclude_kqd_from_tt: 0 };

test('standard import inserts when no active key exists', () => {
  assert.deepEqual(decideStandardImport([], payload), { action: 'insert' });
});

test('standard import skips an equivalent active row instead of creating a duplicate', () => {
  assert.deepEqual(decideStandardImport([{ id: 4, standard_output: '660.000000', exclude_kqd_from_tt: 0 }], payload), { action: 'skip', id: 4 });
});

test('standard import rejects a conflicting active standard without choosing which value is correct', () => {
  assert.throws(
    () => decideStandardImport([{ id: 4, standard_output: 660, exclude_kqd_from_tt: 0 }], { ...payload, standard_output: 598 }),
    (error) => error.code === 'ACTIVE_STANDARD_IMPORT_CONFLICT' && error.status === 409 && error.details.existing[0].id === 4
  );
});

test('standard import rejects when any existing active row conflicts', () => {
  assert.throws(
    () => decideStandardImport([{ id: 4, standard_output: 660 }, { id: 180412, standard_output: 598 }], payload),
    (error) => error.code === 'ACTIVE_STANDARD_IMPORT_CONFLICT'
  );
});
