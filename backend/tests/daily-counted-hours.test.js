const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildDailyCountedHoursSql, queryCountedDailyHours } = require('../utils/dailyCountedHours');

const flat = (sql) => sql.replace(/\s+/g, ' ');

test('GC reports with machine lines count MAX(machine - deduction) of their lines, never parent actual_time', () => {
  const sql = flat(buildDailyCountedHoursSql());
  // approved + temp branches both use machine lines for GC
  assert.match(sql, /p\.process_code='GC' AND EXISTS \(SELECT 1 FROM production_report_machine_lines ml WHERE ml\.report_id=pr\.id\) THEN COALESCE\(\(SELECT MAX\(GREATEST\(0, ml\.machine_time_hours - ml\.deduction_time_hours\)\)/);
  assert.match(sql, /p\.process_code='GC' AND EXISTS \(SELECT 1 FROM production_temp_machine_lines ml WHERE ml\.temp_report_id=pr\.id\) THEN COALESCE\(\(SELECT MAX\(GREATEST\(0, ml\.machine_time_hours - ml\.deduction_time_hours\)\)/);
  // other processes (and GC without lines) count parent actual_time
  assert.equal((sql.match(/ELSE COALESCE\(pr\.actual_time,0\) END AS counted_hours/g) || []).length, 2);
  // split GC groups are counted once (MAX per gc_group_request_id), so parent + children are not double counted
  assert.match(sql, /GROUP BY group_key/);
  assert.match(sql, /MAX\(counted_hours\) AS group_hours/);
  assert.match(sql, /\$\.gc_group_request_id/);
  // statuses: approved (not deleted) + pending/need_fix temp; rejected temp reports do not count
  assert.match(sql, /pr\.status <> 'deleted'/);
  assert.match(sql, /pr\.status IN \('pending','need_fix'\)/);
});

test('report being edited is excluded from the temp branch only when an id is given', async () => {
  const calls = [];
  const run = async (sql, params) => { calls.push({ sql: flat(sql), params }); return [{ counted_hours: '7.5000' }]; };
  assert.equal(await queryCountedDailyHours(run, { workerId: 12, workDate: '2026-11-04' }), 7.5);
  assert.deepEqual(calls[0].params, [12, '2026-11-04', 12, '2026-11-04']);
  assert.doesNotMatch(calls[0].sql, /pr\.id <> \?/);

  assert.equal(await queryCountedDailyHours(run, { workerId: 12, workDate: '2026-11-04', excludeTempReportId: 930001 }), 7.5);
  assert.deepEqual(calls[1].params, [12, '2026-11-04', 12, '2026-11-04', 930001]);
  assert.match(calls[1].sql, /WHERE pr\.worker_id=\? AND pr\.work_date=\? AND pr\.id <> \? AND pr\.status IN \('pending','need_fix'\)/);
  // the approved branch is never filtered by the temp id
  assert.equal((calls[1].sql.match(/pr\.id <> \?/g) || []).length, 1);
});

test('invalid worker/date return null without querying; empty result is zero hours', async () => {
  let called = 0;
  const run = async () => { called += 1; return []; };
  assert.equal(await queryCountedDailyHours(run, { workerId: 0, workDate: '2026-11-04' }), null);
  assert.equal(await queryCountedDailyHours(run, { workerId: 5, workDate: '04/11/2026' }), null);
  assert.equal(called, 0);
  assert.equal(await queryCountedDailyHours(run, { workerId: 5, workDate: '2026-11-04T10:00:00' }), 0);
  assert.equal(called, 1);
});

test('/daily-hours endpoint uses the shared query and validates the optional edited report id', () => {
  const route = fs.readFileSync(path.join(__dirname, '..', 'routes', 'productionTempRoutes.js'), 'utf8');
  const start = route.indexOf('router.get("/daily-hours"');
  const block = route.slice(start, route.indexOf('router.get("/pending"', start));
  assert.match(block, /queryCountedDailyHours\(/);
  assert.match(block, /exclude_report_id/);
  assert.match(block, /limit_hours: 12/);
  assert.doesNotMatch(block, /SUM\(COALESCE\(actual_time/, 'must not sum parent actual_time only');
});
