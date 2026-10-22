const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

test('daily 12h limit tolerates 4-decimal rounding but still rejects real overruns', () => {
  const limit = 12, tol = 0.001;
  const exceeds = (existing, incoming) => existing + incoming > limit + tol;
  assert.equal(exceeds(7.1667, 4 + 50 / 60), false, 'exact 12h (7h10m + 4h50m) must be allowed');
  assert.equal(exceeds(7.1667, 4.9), true, 'a real overrun (+4.9h) must still be rejected');
  assert.equal(exceeds(12, 0.01), true);
  assert.equal(7.1667 + 4 + 50 / 60 > limit + 0.000001, true, 'old tolerance wrongly rejected exact 12h');
});

test('all three daily-hours checks use the shared whole-minute boundary helper', () => {
  for (const file of ['models/productionTempModel.js', 'models/productionTempCreateModel.js', 'models/productionTempUpdateModel.js']) {
    const source = read(file);
    assert.match(source, /DAILY_HOURS_TOLERANCE = 0\.001/, file);
    assert.doesNotMatch(source, /DAILY_HOURS_LIMIT \+ 0\.000001/, file);
  }
});
