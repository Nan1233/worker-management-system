'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { storedStandardSource } = require('../utils/standardSourceCode');

test('maps legacy product-standard machine fallback to a VARCHAR(20)-safe code', () => {
  assert.equal(
    storedStandardSource('LEGACY_PRODUCT_STANDARD_MACHINE_FALLBACK'),
    'LEGACY_MACH_FB',
  );
});

test('maps legacy product-standard process fallback to its compact code', () => {
  assert.equal(
    storedStandardSource('LEGACY_PRODUCT_STANDARD_PROCESS_FALLBACK'),
    'LEGACY_PROC_FBK',
  );
});

test('keeps already compact source codes unchanged', () => {
  assert.equal(storedStandardSource('MACHINE'), 'MACHINE');
  assert.equal(storedStandardSource('DEFAULT'), 'DEFAULT');
});

test('fails explicitly for unsupported long source labels', () => {
  assert.throws(
    () => storedStandardSource('UNSUPPORTED_SOURCE_LABEL_THAT_IS_TOO_LONG'),
    (error) => error.code === 'STANDARD_SOURCE_CODE_UNMAPPED',
  );
});
