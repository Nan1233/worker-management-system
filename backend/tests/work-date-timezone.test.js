'use strict';
// Regression: the server runs in UTC but reports are dated in Vietnam (UTC+7). Between 00:00 and 07:00
// Vietnam time `new Date().setHours(0,0,0,0)` was still the previous day, so a worker reporting TODAY
// (e.g. the night shift finishing at 03:00) got "Không được nhập báo cáo cho ngày tương lai".
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const backend = path.resolve(__dirname, '..');
const script = `
const FIXED = Date.parse('2026-10-21T20:00:00Z'); // 2026-10-22 03:00 in Vietnam
const RealDate = Date;
class FakeDate extends RealDate { constructor(...a) { if (a.length === 0) super(FIXED); else super(...a); } static now() { return FIXED; } }
global.Date = FakeDate;
const { validateProductionReport } = require(${JSON.stringify(path.join(backend, 'utils', 'reportValidation'))});
const out = {};
for (const [label, work_date] of Object.entries({ today: '2026-10-22', tomorrow: '2026-10-23', minus14: '2026-10-08', minus15: '2026-10-07' })) {
  out[label] = validateProductionReport({ work_date, shift: 'A' }, {}).errors.work_date || null;
}
console.log(JSON.stringify(out));
`;

for (const tz of ['UTC', 'Asia/Ho_Chi_Minh', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
  test(`work_date window follows the Vietnam calendar day (server TZ=${tz})`, () => {
    const run = spawnSync(process.execPath, ['-e', script], { cwd: backend, env: { ...process.env, TZ: tz, NODE_ENV: 'test' }, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    const result = JSON.parse(run.stdout.trim().split('\n').pop());
    assert.equal(result.today, null, 'today (VN) is allowed');
    assert.match(result.tomorrow || '', /tương lai/, 'tomorrow (VN) is rejected');
    assert.equal(result.minus14, null, '14 days back is allowed');
    assert.match(result.minus15 || '', /14 ngày/, '15 days back is rejected');
  });
}
