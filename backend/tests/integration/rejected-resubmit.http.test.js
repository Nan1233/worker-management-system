'use strict';

// Real HTTP + real database. Lifecycle under test (docs/KTC_REQUIREMENT_LOCK_WAVE0_20260812.md R5):
//   pending -> rejected -> worker edits the SAME report -> pending -> approved
// Worker edit window: pending = 10 min from creation; rejected = 10 min from rejection.

const test = require('node:test');
const assert = require('node:assert/strict');
const h = require('./harness');

const opts = { skip: h.skipReason };
const state = {};

test.before(async () => {
  if (!h.enabled) return;
  const { db } = await h.start();
  state.db = db;
  state.worker = await h.createUser(db, { username: 'W-REJ-1', role: 'worker', workerCode: 'W-REJ-1', processCodes: ['XLBV'] });
  state.otherWorker = await h.createUser(db, { username: 'W-REJ-2', role: 'worker', workerCode: 'W-REJ-2', processCodes: ['XLBV'] });
  state.manager = await h.createUser(db, { username: 'mgr-rej', role: 'manager', processCodes: ['XLBV'] });
  state.outsideManager = await h.createUser(db, { username: 'mgr-gc', role: 'manager', processCodes: ['GC'] });
  state.workerToken = (await h.loginWorker('W-REJ-1')).token;
  state.otherToken = (await h.loginWorker('W-REJ-2')).token;
  state.managerToken = (await h.loginManagement('mgr-rej', 'Passw0rd!x')).token;
  state.outsideToken = (await h.loginManagement('mgr-gc', 'Passw0rd!x')).token;
  assert.ok(state.workerToken && state.otherToken && state.managerToken && state.outsideToken, 'fixtures must be able to log in');
});

test.after(async () => { if (h.enabled) await h.stop(); });

// One report per work date: the 12 h/day rule would (correctly) reject several
// 8 h reports on the same day. Valid dates are today..today-14.
let dayOffset = 0;
async function newReport(overrides = {}) {
  dayOffset += 1;
  const body = await h.manualReportBody(state.db, { workDate: h.vnDate(-dayOffset), ...overrides });
  const res = await h.submitReport(state.workerToken, body);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return { id: res.body.id, body };
}

const reject = (id, reason = 'Sai sản lượng', token = state.managerToken) =>
  h.request('POST', '/api/production-temp/reject-selected', { token, body: { ids: [id], reason } });

const row = async (id) => (await state.db.query('SELECT * FROM production_reports_temp WHERE id=?', [id]))[0][0];

test('reject requires a reason and respects process scope', opts, async () => {
  const { id } = await newReport({ shift: 'A' });
  const noReason = await h.request('POST', '/api/production-temp/reject-selected', { token: state.managerToken, body: { ids: [id] } });
  assert.equal(noReason.status, 422);
  assert.equal((await row(id)).status, 'pending');

  const outside = await reject(id, 'khong thuoc pham vi', state.outsideToken);
  assert.ok([200, 403, 409].includes(outside.status));
  assert.equal((await row(id)).status, 'pending', 'a manager outside the process must not be able to reject');

  const ok = await reject(id);
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const after = await row(id);
  assert.equal(after.status, 'rejected');
  assert.equal(after.review_note, 'Sai sản lượng');
});

test('worker is notified with a link to the report detail', opts, async () => {
  const { id } = await newReport({ shift: 'B' });
  await reject(id, 'Thiếu thông tin');
  const [notes] = await state.db.query("SELECT type, link_url, message FROM notifications WHERE entity_id=? AND type='report_rejected'", [id]);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].link_url, `/worker/history/${id}?source=temp`);
  // The work date must read as a date (2026-10-07), not as "Wed Oct 07".
  assert.match(notes[0].message, /Báo cáo ngày \d{4}-\d{2}-\d{2}, ca B/);
  assert.doesNotMatch(notes[0].message, /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/);
});

test('rejected report: worker edits the SAME report, it returns to pending, no duplicate row, RESUBMIT audited', opts, async () => {
  const { id, body } = await newReport({ shift: 'C', ok: 100 });
  await reject(id, 'Nhập sai OK');
  const before = (await state.db.query('SELECT COUNT(*) c FROM production_reports_temp WHERE worker_id=?', [state.worker.workerId]))[0][0].c;

  const detail = await h.request('GET', `/api/production-temp/${id}`, { token: state.workerToken });
  assert.equal(detail.status, 200);
  assert.equal(detail.body.data.status, 'rejected');
  assert.equal(detail.body.data.review_note, 'Nhập sai OK');

  const put = await h.request('PUT', `/api/production-temp/${id}`, {
    token: state.workerToken,
    body: { ...body, tt_ok: 90, actual_output: 90, note: 'đã sửa', expected_updated_at: detail.body.data.updated_at }
  });
  assert.equal(put.status, 200, JSON.stringify(put.body));

  const after = await row(id);
  assert.equal(after.status, 'pending');
  assert.equal(after.review_note, null);
  assert.equal(Number(after.tt_ok), 90);
  const countAfter = (await state.db.query('SELECT COUNT(*) c FROM production_reports_temp WHERE worker_id=?', [state.worker.workerId]))[0][0].c;
  assert.equal(countAfter, before, 'resubmit must not create a second report');

  const [logs] = await state.db.query("SELECT action FROM report_action_logs WHERE report_type='temp' AND report_id=?", [id]);
  assert.ok(logs.some((l) => l.action === 'RESUBMIT'), `expected RESUBMIT in ${JSON.stringify(logs)}`);

  const [reviewers] = await state.db.query("SELECT user_id FROM notifications WHERE entity_id=? AND type='report_resubmitted'", [id]);
  assert.ok(reviewers.some((n) => n.user_id === state.manager.userId), 'in-scope manager must be told the report was resubmitted');

  // The resubmitted report is reviewable and approvable again.
  const approve = await h.request('POST', '/api/production-temp/approve-selected', { token: state.managerToken, body: { ids: [id] } });
  assert.equal(approve.status, 200, JSON.stringify(approve.body));
  const [[approved]] = await state.db.query('SELECT tt_ok, status FROM production_reports WHERE source_temp_id=?', [id]);
  assert.equal(Number(approved.tt_ok), 90, 'approved report must carry the corrected value');
  assert.equal(approved.status, 'approved');
});

test('rejected window is 10 minutes from the REJECTION, not from creation', opts, async () => {
  const { id, body } = await newReport({ shift: 'D' });
  await reject(id, 'Sai ca');
  // created 3 hours ago, rejected 1 minute ago
  await state.db.query('UPDATE production_reports_temp SET created_at = created_at - INTERVAL 3 HOUR, updated_at = NOW() - INTERVAL 1 MINUTE WHERE id=?', [id]);
  const put = await h.request('PUT', `/api/production-temp/${id}`, { token: state.workerToken, body: { ...body, note: 'sửa lại sau 3 giờ' } });
  assert.equal(put.status, 200, JSON.stringify(put.body));
  assert.equal((await row(id)).status, 'pending');
});

test('rejected report cannot be edited by the worker after 10 minutes from rejection', opts, async () => {
  const { id, body } = await newReport({ shift: 'Ca 1' });
  await reject(id, 'Trễ');
  await state.db.query('UPDATE production_reports_temp SET updated_at = NOW() - INTERVAL 11 MINUTE WHERE id=?', [id]);
  const put = await h.request('PUT', `/api/production-temp/${id}`, { token: state.workerToken, body: { ...body, note: 'quá hạn' } });
  assert.equal(put.status, 422, JSON.stringify(put.body));
  assert.equal(put.body.code, 'WORKER_EDIT_WINDOW_EXPIRED');
  assert.equal((await row(id)).status, 'rejected');
});

test('pending report still uses the 10-minute-from-creation window', opts, async () => {
  const { id, body } = await newReport({ shift: 'Ca 2' });
  const inside = await h.request('PUT', `/api/production-temp/${id}`, { token: state.workerToken, body: { ...body, note: 'trong hạn' } });
  assert.equal(inside.status, 200, JSON.stringify(inside.body));
  await state.db.query('UPDATE production_reports_temp SET created_at = NOW() - INTERVAL 11 MINUTE WHERE id=?', [id]);
  const outside = await h.request('PUT', `/api/production-temp/${id}`, { token: state.workerToken, body: { ...body, note: 'quá hạn' } });
  assert.equal(outside.status, 422, JSON.stringify(outside.body));
  assert.equal(outside.body.code, 'WORKER_EDIT_WINDOW_EXPIRED');
});

test('another worker cannot edit someone else\'s rejected report', opts, async () => {
  const { id, body } = await newReport({ shift: 'Ca 3' });
  await reject(id, 'x');
  const put = await h.request('PUT', `/api/production-temp/${id}`, { token: state.otherToken, body: { ...body, note: 'hack' } });
  assert.ok([403, 404].includes(put.status), `got ${put.status}`);
  assert.equal((await row(id)).status, 'rejected');
});

test('approved report cannot be edited by the worker', opts, async () => {
  const { id, body } = await newReport({ shift: 'A', productIndex: 1 });
  const approve = await h.request('POST', '/api/production-temp/approve-selected', { token: state.managerToken, body: { ids: [id] } });
  assert.equal(approve.status, 200, JSON.stringify(approve.body));
  const put = await h.request('PUT', `/api/production-temp/${id}`, { token: state.workerToken, body: { ...body, note: 'sau duyệt' } });
  assert.equal(put.status, 422, JSON.stringify(put.body));
  assert.equal((await row(id)).status, 'approved');
});
