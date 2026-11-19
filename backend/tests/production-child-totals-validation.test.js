'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateChildTotals } = require('../services/productionChildTotalsValidation');

test('matching NG and deduction totals are accepted', () => {
  assert.doesNotThrow(() => validateChildTotals(
    { tt_ng: 3, deduction_time: 70 / 60 },
    [{ quantity: 1 }, { quantity: 2 }],
    [{ hours: 30 / 60 }, { hours: 40 / 60 }],
  ));
});

test('fractional stored hours from 70 minutes tolerate one-minute rounding', () => {
  assert.doesNotThrow(() => validateChildTotals(
    { tt_ng: 0, deduction_time: 1.17 },
    [],
    [{ hours: 70 / 60 }],
  ));
  assert.doesNotThrow(() => validateChildTotals(
    { tt_ng: 0, deduction_time: 1.15 },
    [],
    [{ hours: 70 / 60 }],
  ));
});

test('NG total mismatch preserves public status, code, and expected vs actual', () => {
  assert.throws(
    () => validateChildTotals({ tt_ng: 3 }, [{ quantity: 1 }], []),
    (e) => e.status === 422 && e.code === 'NG_DETAIL_TOTAL_MISMATCH'
      && e.isPublic === true && e.details.expected === 3 && e.details.actual === 1,
  );
});

test('deduction mismatch above one minute preserves public status, code, and minutes', () => {
  assert.throws(
    () => validateChildTotals({ tt_ng: 0, deduction_time: 1 }, [], [{ hours: 0.5 }]),
    (e) => e.status === 422 && e.code === 'DEDUCTION_DETAIL_TOTAL_MISMATCH'
      && e.isPublic === true && e.details.expectedMinutes === 60 && e.details.actualMinutes === 30,
  );
});

test('negative NG and hours follow existing normalization rules', () => {
  assert.doesNotThrow(() => validateChildTotals({ tt_ng: -1, deduction_time: 0 }, [{ quantity: -5 }], []));
});

test('submission module imports extracted validation without changing the call site', () => {
  const service = fs.readFileSync(path.join(__dirname, '../services/productionTempSubmissionService.js'), 'utf8');
  assert.match(service, /require\('\.\/productionChildTotalsValidation'\)/);
  assert.match(service, /validateChildTotals\(/);
  assert.doesNotMatch(service, /const validateChildTotals =/);
});
