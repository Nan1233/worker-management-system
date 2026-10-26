const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DAILY_HOURS_LIMIT, exceedsDailyHoursLimit } = require('../utils/dailyHoursLimit');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

test('daily 12h limit tolerates 4-decimal rounding but still rejects real overruns', () => {
  assert.equal(DAILY_HOURS_LIMIT, 12);
  assert.equal(exceedsDailyHoursLimit(7.1667 + 4 + 50 / 60), false, 'exact 12h (7h10m + 4h50m) must be allowed');
  assert.equal(exceedsDailyHoursLimit(7.1667 + 4.9), true, 'a real overrun (+4.9h) must still be rejected');
  assert.equal(exceedsDailyHoursLimit(12.01), true);
});

test('all three report flows delegate to one shared whole-minute boundary guard', () => {
  for (const file of ['models/productionTempModel.js', 'models/productionTempCreateModel.js', 'models/productionTempUpdateModel.js']) {
    const source = read(file);
    assert.match(source, /assertWorkerShiftHours\(/, file);
    assert.doesNotMatch(source, /DAILY_HOURS_LIMIT \+ 0\.000001/, file);
  }
  assert.match(read('services/workerShiftHoursGuard.js'), /exceedsDailyHoursLimit\(/);
});
