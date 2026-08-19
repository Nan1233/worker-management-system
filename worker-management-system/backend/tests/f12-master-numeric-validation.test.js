'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const numeric = require('../services/masterNumericValidationService');
const validation = require('../services/excelMasterSyncValidationService');

const productConfig = validation.ENTITY_CONFIGS.product_standards;
const defectConfig = validation.ENTITY_CONFIGS.defect_types;
const { validateRows, collectWorkbookProcessIds } = validation;
const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

function oneStandard(value, extra = {}) {
  return [{ __rowNumber: 7, process_id: 1, product_code: 'QC-1', standard_output: value, ...extra }];
}

function invalidStandard(value) {
  const out = validateRows(productConfig, oneStandard(value));
  assert.equal(out.valid.length, 0);
  assert.equal(out.invalid.length, 1);
  return out.invalid[0];
}

for (const [name, value, code] of [
  ['blank', '', 'MASTER_NUMERIC_REQUIRED'],
  ['whitespace', '   \t', 'MASTER_NUMERIC_REQUIRED'],
  ['null', null, 'MASTER_NUMERIC_REQUIRED'],
  ['undefined', undefined, 'MASTER_NUMERIC_REQUIRED'],
  ['alphabetic string', 'abc', 'MASTER_NUMERIC_INVALID'],
  ['NaN', Number.NaN, 'MASTER_NUMERIC_INVALID'],
  ['Infinity', Number.POSITIVE_INFINITY, 'MASTER_NUMERIC_INVALID'],
  ['zero number', 0, 'MASTER_NUMERIC_OUT_OF_RANGE'],
  ['zero string', '0', 'MASTER_NUMERIC_OUT_OF_RANGE'],
  ['negative', -5, 'MASTER_NUMERIC_OUT_OF_RANGE'],
]) {
  test(`F12 product standard ${name} is rejected without zero fallback`, () => {
    const row = invalidStandard(value);
    assert.equal(row.code, code);
    assert.equal(row.field, 'standard_output');
    assert.notEqual(row.row.standard_output, 0);
  });
}

for (const value of [617.1, 900.77, 1066.39, 309.76]) {
  test(`F12 decimal standard ${value} is preserved exactly through row normalization`, () => {
    const out = validateRows(productConfig, oneStandard(value));
    assert.equal(out.invalid.length, 0);
    assert.equal(out.valid.length, 1);
    assert.equal(out.valid[0].row.standard_output, value);
  });
}

test('F12 numeric string and scientific numeric notation remain finite decimals', () => {
  assert.deepEqual(numeric.parseNumeric('617.1').state, 'valid');
  assert.equal(numeric.validateMasterNumeric('standard_output', '617.1').value, 617.1);
  assert.equal(numeric.validateMasterNumeric('standard_output', '1e3').value, 1000);
});

test('F12 comma locale string is rejected rather than guessed', () => {
  assert.throws(() => numeric.validateMasterNumeric('standard_output', '617,1'), (e) => e.code === 'MASTER_NUMERIC_INVALID');
});

test('F12 Excel formula result is validated, not formula object stringification', () => {
  const out = validateRows(productConfig, oneStandard({ formula:'300+317.1', result:617.1 }));
  assert.equal(out.invalid.length, 0);
  assert.equal(out.valid[0].row.standard_output, 617.1);
});

test('F12 zero-valid KQD field preserves numeric/string zero and one', () => {
  for (const [input, expected] of [[0,0], ['0',0], [1,1], ['1',1]]) {
    assert.equal(numeric.validateMasterNumeric('exclude_kqd_from_tt', input).value, expected);
  }
});

test('F12 optional KQD blank uses explicit business default zero, not invalid fallback', () => {
  const parsed = numeric.validateMasterNumeric('exclude_kqd_from_tt', '   ');
  assert.equal(parsed.value, 0);
  assert.equal(parsed.sourceState, 'missing');
});

test('F12 optional sort_order blank uses schema default zero and valid zero stays zero', () => {
  assert.equal(numeric.validateMasterNumeric('sort_order', '').value, 0);
  assert.equal(numeric.validateMasterNumeric('sort_order', '0').value, 0);
});

test('F12 negative/non-integer sort_order is rejected', () => {
  assert.throws(() => numeric.validateMasterNumeric('sort_order', -1), (e) => e.code === 'MASTER_NUMERIC_OUT_OF_RANGE');
  assert.throws(() => numeric.validateMasterNumeric('sort_order', 1.5), (e) => e.code === 'MASTER_NUMERIC_OUT_OF_RANGE');
});

test('F12 required process_id is positive integer and never coerces bad input to zero', () => {
  for (const bad of ['', null, undefined, 'abc', 0, -1, 1.2]) {
    assert.throws(() => numeric.validateMasterNumeric('process_id', bad), (e) => /^MASTER_NUMERIC_/.test(e.code));
  }
  assert.equal(numeric.validateMasterNumeric('process_id', '7').value, 7);
});

test('F12 defect optional sort_order blank normalizes to explicit zero business default', () => {
  const out = validateRows(defectConfig, [{process_id:1, defect_code:'RACH', defect_name:'Rách', sort_order:''}]);
  assert.equal(out.invalid.length, 0);
  assert.equal(out.valid[0].row.sort_order, 0);
});

test('F12 unauthorized-process collection happens independently of deep standard validity', () => {
  assert.deepEqual(collectWorkbookProcessIds([{process_id:9, product_code:'X', standard_output:''}]), [9]);
});

test('F12 service source authorizes workbook processes before deep validation/data load', () => {
  const src = read('services/excelMasterSyncService.js');
  const preview = src.indexOf('async function preview');
  const ids = src.indexOf('collectWorkbookProcessIds(rows)', preview);
  const scope = src.indexOf("assertProcessesScope(actor, processIds, { action: 'EXCEL_MASTER_SYNC_PREVIEW' })", preview);
  const validate = src.indexOf('validateRows(config, rows)', preview);
  const dbLoad = src.indexOf('db.promise().getConnection()', preview);
  assert.ok(ids > preview && scope > ids && validate > scope && dbLoad > validate);
});

test('F12 apply revalidates server-side through preview before opening mutation transaction', () => {
  const src = read('services/excelMasterSyncService.js');
  const apply = src.indexOf('async function apply');
  const preview = src.indexOf('const result = await preview(payload, actor)', apply);
  const connection = src.indexOf('db.promise().getConnection()', apply);
  const begin = src.indexOf('beginTransaction()', apply);
  assert.ok(preview > apply && connection > preview && begin > connection);
});

test('F12 Admin Master uses same central numeric validator as Excel Master Sync', () => {
  const admin = read('controllers/adminMasterController.js');
  const excelValidation = read('services/excelMasterSyncValidationService.js');
  assert.match(admin, /validateMasterNumeric\('standard_output'/);
  assert.match(excelValidation, /safeValidateMasterNumeric\(numericRule, rawValue\)/);
  assert.match(admin, /validateMasterNumeric\('process_id'/);
});

test('F12 Admin/Excel semantics reject standard zero and preserve decimal', () => {
  assert.throws(() => numeric.validateMasterNumeric('standard_output', 0), (e) => e.code === 'MASTER_NUMERIC_OUT_OF_RANGE');
  assert.equal(numeric.validateMasterNumeric('standard_output', 900.77).value, 900.77);
  const out = validateRows(productConfig, oneStandard(900.77));
  assert.equal(out.valid[0].row.standard_output, 900.77);
});

test('F12 duplicate workbook rows remain deterministic and are not merged by parser', () => {
  const out = validateRows(productConfig, [...oneStandard(617.1), {...oneStandard(900.77)[0], __rowNumber:8}]);
  assert.equal(out.valid.length, 1);
  assert.equal(out.invalid.length, 1);
  assert.equal(out.invalid[0].code, 'MASTER_DUPLICATE_ROW');
});

test('F12 no authoritative Excel numeric path uses blanket invalid-to-zero fallback', () => {
  const src = read('services/excelMasterSyncService.js');
  assert.doesNotMatch(src, /!Number\.isFinite\(value\)\) value = 0/);
  assert.doesNotMatch(src, /Number\([^)]*\)\s*\|\|\s*0/);
  assert.doesNotMatch(src, /parseFloat\([^)]*\)\s*\|\|\s*0/);
});

test('F12 integrity scanner is read-only and flags invalid authoritative standards for review', () => {
  const src = read('scripts/checkDatabaseIntegrity.js');
  assert.match(src, /INVALID_ACTIVE_PRODUCT_STANDARD/);
  assert.match(src, /standard_output IS NULL OR standard_output <= 0/);
  assert.match(src, /INVALID_ACTIVE_MACHINE_STANDARD/);
  assert.doesNotMatch(src, /\b(?:UPDATE|DELETE|INSERT|ALTER)\b/i);
});

test('F12 active runtime master numeric write sweep has no second invalid-to-zero product-standard API path', () => {
  const admin = read('controllers/adminMasterController.js');
  const excelValidation = read('services/excelMasterSyncValidationService.js');
  assert.match(admin, /validateMasterNumeric\('standard_output'/);
  assert.match(excelValidation, /standard_output: 'standard_output'/);
  const runtime = [admin, excelValidation].join('\n');
  assert.doesNotMatch(runtime, /standard_output\s*=\s*Number\([^)]*\)\s*\|\|\s*0/);
});
