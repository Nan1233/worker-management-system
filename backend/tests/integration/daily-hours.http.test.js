'use strict';
// Real HTTP + real database: the 12 h/day cap.
//  - rounding: 3 x 1h40 (stored 1.6667 h each) + 7 h is exactly 12 h and must be accepted; +1 minute must not.
//  - race: parallel submissions must never exceed 12 h (REPEATABLE READ snapshot taken before the row lock
//    used to hide the concurrent insert, so 4 x 4 h = 16 h were accepted).
const test = require('node:test');
const assert = require('node:assert/strict');
const h = require('./harness');

const opts = { skip: h.skipReason };
const s = {};
let seq = 0;
const SHIFTS = ['A', 'B', 'C', 'D', 'Ca 1', 'Ca 2', 'Ca 3'];

test.before(async () => {
  if (!h.enabled) return;
  const { db } = await h.start();
  s.db = db;
});
test.after(async () => { if (h.enabled) await h.stop(); });

async function newWorker() {
  seq += 1;
  const code = `DH${Date.now().toString(36)}${seq}`;
  await h.createUser(s.db, { username: code, role: 'worker', workerCode: code, processCodes: ['XLBV'] });
  return (await h.loginWorker(code)).token;
}
const submit = async (token, date, shift, hours) => (await h.submitReport(token, await h.manualReportBody(s.db, { processCode: 'XLBV', workDate: date, shift, actualHours: hours, deductionHours: 0 }))).status;

test('exactly 12 h made of rounded minutes is accepted, one more minute is rejected', opts, async () => {
  const token = await newWorker();
  const date = h.vnDate(-3);
  const statuses = [];
  for (let i = 0; i < 3; i += 1) statuses.push(await submit(token, date, SHIFTS[i], 5 / 3));
  statuses.push(await submit(token, date, SHIFTS[3], 7));
  assert.deepEqual(statuses, [201, 201, 201, 201], 'day totals exactly 12 h');
  assert.equal(await submit(token, date, SHIFTS[4], 1 / 60), 422, 'one extra minute is over the cap');
});

test('parallel submissions never exceed 12 h (6 requests x 4 h => exactly 3 accepted)', opts, async () => {
  for (let round = 0; round < 3; round += 1) {
    const token = await newWorker();
    const date = h.vnDate(-(4 + round));
    const statuses = await Promise.all(SHIFTS.slice(0, 6).map((shift) => submit(token, date, shift, 4)));
    assert.equal(statuses.filter((x) => x === 201).length, 3, `round ${round}: ${statuses.join(',')}`);
    const [[sum]] = await s.db.query('SELECT COALESCE(SUM(actual_time),0) AS hours FROM production_reports_temp WHERE worker_id=(SELECT id FROM workers ORDER BY id DESC LIMIT 1) AND work_date=?', [date]);
    assert.equal(Number(sum.hours), 12, 'stored hours never above 12');
  }
});
