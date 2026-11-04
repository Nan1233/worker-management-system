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

test('all three daily-hours checks use the shared whole-minute boundary helper', () => {
  // Submission orchestration moved from models/productionTempModel.js (now a facade) into
  // services/productionTempSubmissionService.js; the guard set is unchanged.
  for (const file of ['services/productionTempSubmissionService.js', 'models/productionTempCreateModel.js', 'models/productionTempUpdateModel.js']) {
    const source = read(file);
    assert.match(source, /exceedsDailyHoursLimit\(/, file);
    assert.doesNotMatch(source, /DAILY_HOURS_LIMIT \+ 0\.000001/, file);
  }
  assert.match(read('models/productionTempModel.js'), /\.\.\.submissionService/, 'facade re-exports the submission service');
});

test('the read endpoint and every 12-hour guard count existing hours with the same shared query', () => {
  for (const file of ['routes/productionTempRoutes.js', 'services/productionTempSubmissionService.js', 'models/productionTempCreateModel.js', 'models/productionTempUpdateModel.js']) {
    const source = read(file);
    assert.match(source, /queryCountedDailyHours\(/, `${file} must use utils/dailyCountedHours`);
    assert.doesNotMatch(source, /AS counted_hours FROM/, `${file} must not carry its own counted-hours SQL`);
  }
});
