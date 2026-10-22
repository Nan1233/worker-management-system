'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { exceedsDailyHoursLimit, DAILY_HOURS_LIMIT } = require('../utils/dailyHoursLimit');

test('12 h cap compares whole minutes', () => {
  assert.equal(DAILY_HOURS_LIMIT, 12);
  assert.equal(exceedsDailyHoursLimit(0), false);
  assert.equal(exceedsDailyHoursLimit(1 / 60), false);
  assert.equal(exceedsDailyHoursLimit(11 + 59 / 60), false, '11h59');
  assert.equal(exceedsDailyHoursLimit(12), false, 'exactly 12h');
  assert.equal(exceedsDailyHoursLimit(3 * 1.6667 + 7), false, '3 x 1h40 stored as 1.6667 + 7h = 12.0001 h is still 12h');
  assert.equal(exceedsDailyHoursLimit(12 + 1 / 60), true, '12h01');
  assert.equal(exceedsDailyHoursLimit(12.5), true);
  assert.equal(exceedsDailyHoursLimit(24), true);
});
