'use strict';

// Real HTTP + real database: manager/lead review workflow.
//   pending list -> approve (single, bulk) -> stale selection -> double approve
//   -> edit approved (+ optimistic concurrency) -> version history -> restore -> scope

const test = require('node:test');
const assert = require('node:assert/strict');
const h = require('./harness');

const opts = { skip: h.skipReason };
const s = {};
let sequence = 0;
const SHIFTS = ['A', 'B', 'C', 'D', 'Ca 1', 'Ca 2', 'Ca 3'];

test.before(async () => {
  if (!h.enabled) return;
  const { db } = await h.start();
  s.db = db;
  s.w1 = await h.createUser(db, { username: 'AF-W1', role: 'worker', workerCode: 'AF-W1', processCodes: ['XLBV', 'K1'] });
  s.w2 = await h.createUser(db, { username: 'AF-W2', role: 'worker', workerCode: 'AF-W2', processCodes: ['XLBV'] });
  await h.createUser(db, { username: 'af-mgr', role: 'manager', processCodes: ['XLBV'] });
  await h.createUser(db, { username: 'af-lead', role: 'lead', processCodes: ['XLBV'] });
  await h.createUser(db, { username: 'af-other', role: 'manager', processCodes: ['K1'] });
  await h.createUser(db, { username: 'af-admin', role: 'admin' });
  s.t1 = (await h.loginWorker('AF-W1')).token;
  s.t2 = (await h.loginWorker('AF-W2')).token;
  s.mgr = (await h.loginManagement('af-mgr', 'Passw0rd!x')).token;
  s.lead = (await h.loginManagement('af-lead', 'Passw0rd!x')).token;
  s.other = (await h.loginManagement('af-other', 'Passw0rd!x')).token;
  s.admin = (await h.loginManagement('af-admin', 'Passw0rd!x')).token;
  assert.ok(s.t1 && s.t2 && s.mgr && s.lead && s.other && s.admin);
});

test.after(async () => { if (h.enabled) await h.stop(); });

// Each report gets its own (work date, shift) so duplicate detection never fires, and 2 h of
// work so the 12 h/day rule never fires; work dates stay inside today-1..today-10 (14-day rule).
async function pendingReport(token = s.t1, overrides = {}) {
  const n = sequence;
  sequence += 1;
  const body = await h.manualReportBody(s.db, {
    workDate: h.vnDate(-(1 + (n % 10))), shift: SHIFTS[Math.floor(n / 10) % SHIFTS.length], actualHours: 2, deductionHours: 0, ...overrides
  });
  const res = await h.submitReport(token, body);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return { id: res.body.id, body };
}
const approve = (ids, token = s.mgr) => h.request('POST', '/api/production-temp/approve-selected', { token, body: { ids } });
const approvedRow = async (tempId) => (await s.db.query('SELECT * FROM production_reports WHERE source_temp_id=?', [tempId]))[0][0];

test('pending list shows only reports inside the reviewer scope', opts, async () => {
  const { id } = await pendingReport();
  const mine = await h.request('GET', '/api/production-temp/pending', { token: s.mgr });
  assert.equal(mine.status, 200, JSON.stringify(mine.body));
  const rows = mine.body.data.reports || mine.body.data;
  assert.ok(rows.some((r) => r.id === id), 'in-scope manager sees the report');
  const other = await h.request('GET', '/api/production-temp/pending', { token: s.other });
  const otherRows = other.body.data?.reports || other.body.data || [];
  assert.ok(!otherRows.some((r) => r.id === id), 'manager of another process must not see it');
});

test('approve twice (double click / retry): exactly one approved row, same result', opts, async () => {
  const { id } = await pendingReport();
  const first = await approve([id]);
  assert.equal(first.status, 200, JSON.stringify(first.body));
  const again = await approve([id]);
  assert.equal(again.status, 200, JSON.stringify(again.body));
  assert.deepEqual(again.body.data.approved_ids, first.body.data.approved_ids, 'retry must return the same approved report');
  const [rows] = await s.db.query('SELECT id FROM production_reports WHERE source_temp_id=?', [id]);
  assert.equal(rows.length, 1, 'no duplicate approved report');
});

test('approve in parallel: still exactly one approved row', opts, async () => {
  const { id } = await pendingReport();
  const results = await Promise.all([approve([id]), approve([id]), approve([id])]);
  for (const r of results) assert.ok([200, 409].includes(r.status), `got ${r.status}: ${JSON.stringify(r.body)}`);
  assert.ok(results.some((r) => r.status === 200));
  const [rows] = await s.db.query('SELECT id FROM production_reports WHERE source_temp_id=?', [id]);
  assert.equal(rows.length, 1);
});

test('approve outside the reviewer scope is refused and changes nothing', opts, async () => {
  const { id } = await pendingReport();
  const res = await approve([id], s.other);
  assert.ok([403, 409].includes(res.status), `got ${res.status}`);
  assert.equal((await s.db.query('SELECT status FROM production_reports_temp WHERE id=?', [id]))[0][0].status, 'pending');
  assert.equal((await s.db.query('SELECT COUNT(*) c FROM production_reports WHERE source_temp_id=?', [id]))[0][0].c, 0);
});

test('bulk approve is all-or-nothing: one stale id rolls the whole batch back (409)', opts, async () => {
  const a = await pendingReport();
  const b = await pendingReport();
  assert.equal((await approve([b.id])).status, 200); // b is now approved => stale for the batch
  const batch = await approve([a.id, b.id]);
  assert.equal(batch.status, 409, JSON.stringify(batch.body));
  assert.equal(batch.body.code, 'APPROVAL_SELECTION_STALE');
  assert.equal((await s.db.query('SELECT status FROM production_reports_temp WHERE id=?', [a.id]))[0][0].status, 'pending', 'a must stay pending');
  assert.equal((await s.db.query('SELECT COUNT(*) c FROM production_reports WHERE source_temp_id=?', [a.id]))[0][0].c, 0);
});

test('bulk approve of several fresh reports approves them all', opts, async () => {
  const ids = [(await pendingReport()).id, (await pendingReport(s.t2)).id, (await pendingReport()).id];
  const res = await approve(ids);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  for (const id of ids) assert.equal((await approvedRow(id)).status, 'approved');
});

test('bulk approve with expected_updated_at detects a report edited after the list was loaded', opts, async () => {
  const { id, body } = await pendingReport();
  const detail = await h.request('GET', `/api/production-temp/${id}`, { token: s.mgr });
  const staleStamp = detail.body.data.updated_at;
  // worker edits inside the 10-minute window after the manager loaded the list
  await new Promise((resolve) => setTimeout(resolve, 1100));
  const edit = await h.request('PUT', `/api/production-temp/${id}`, { token: s.t1, body: { ...body, tt_ok: 80, actual_output: 80 } });
  assert.equal(edit.status, 200, JSON.stringify(edit.body));
  // The web app sends both ids and targets.
  const res = await h.request('POST', '/api/production-temp/approve-selected', { token: s.mgr, body: { ids: [id], targets: [{ id, expected_updated_at: staleStamp }] } });
  assert.equal(res.status, 409, JSON.stringify(res.body));
  assert.equal(res.body.code, 'TEMP_REPORT_VERSION_CONFLICT');
  assert.equal((await s.db.query('SELECT status FROM production_reports_temp WHERE id=?', [id]))[0][0].status, 'pending');
});

test('approved report: edit creates a version, history lists it, restore brings the old values back', opts, async () => {
  // Restoring is only allowed for reports that carry a historical standard version, which
  // is what the master-data screen creates when a standard is added.
  const [[xlbv]] = await s.db.query("SELECT id FROM processes WHERE process_code='XLBV'");
  const created = await h.request('POST', '/api/admin/master/standards', { token: s.mgr, body: { process_id: xlbv.id, product_code: 'IT-RESTORE', standard_output: 50, work_type: 'XLBV' } });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  // Production data carries explicit historical versions; nothing in the repo SQL seeds them
  // (only migration 032 inserts one), so give this product one.
  await s.db.query(
    "INSERT INTO product_standard_versions (process_id, product_code, standard_output, exclude_kqd_from_tt, version_no, effective_from, status) VALUES (?, 'IT-RESTORE', 50, 0, 1, '2000-01-01', 'active')",
    [xlbv.id]
  );
  const { id, body } = await pendingReport(s.t1, { ok: 100, productCode: 'IT-RESTORE', standardOutput: 50 });
  assert.equal((await approve([id])).status, 200);
  const approved = await approvedRow(id);
  const detail = await h.request('GET', `/api/production/${approved.id}`, { token: s.mgr });
  assert.equal(detail.status, 200);

  const edit = await h.request('PUT', `/api/production/${approved.id}`, {
    token: s.mgr, body: { ...body, tt_ok: 70, actual_output: 70, reason: 'Điều chỉnh số liệu', expected_updated_at: detail.body.data.updated_at }
  });
  assert.equal(edit.status, 200, JSON.stringify(edit.body));
  assert.equal(Number((await approvedRow(id)).tt_ok), 70);

  const history = await h.request('GET', `/api/system/reports/${approved.id}/versions?type=approved`, { token: s.mgr });
  assert.equal(history.status, 200);
  const versions = history.body.data;
  assert.ok(versions.length >= 2, `expected >= 2 versions, got ${versions.length}`);

  const first = Math.min(...versions.map((v) => v.version_no));
  const fresh = await h.request('GET', `/api/production/${approved.id}`, { token: s.mgr });
  const restore = await h.request('POST', `/api/production/${approved.id}/versions/${first}/restore`, {
    token: s.mgr, body: { reason: 'Khôi phục bản đầu', expected_updated_at: fresh.body.data.updated_at }
  });
  assert.equal(restore.status, 200, JSON.stringify(restore.body));
  assert.equal(Number((await approvedRow(id)).tt_ok), 100, 'restore must bring back the original value');
});

test('approved edit uses optimistic concurrency: a stale expected_updated_at is refused', opts, async () => {
  const { id, body } = await pendingReport();
  assert.equal((await approve([id])).status, 200);
  const approved = await approvedRow(id);
  const stale = '2020-01-01T00:00:00.000Z';
  const res = await h.request('PUT', `/api/production/${approved.id}`, { token: s.mgr, body: { ...body, tt_ok: 60, actual_output: 60, expected_updated_at: stale } });
  assert.equal(res.status, 409, JSON.stringify(res.body));
  assert.equal(Number((await approvedRow(id)).tt_ok), 100, 'value unchanged');
});

test('approved report detail carries process_code (the edit form picks its layout from it)', opts, async () => {
  const { id } = await pendingReport();
  assert.equal((await approve([id])).status, 200);
  const approved = await approvedRow(id);
  const detail = await h.request('GET', `/api/production/${approved.id}`, { token: s.mgr });
  assert.equal(detail.status, 200);
  assert.equal(detail.body.data.process_code, 'XLBV');
  const pending = await h.request('GET', `/api/production-temp/${id}`, { token: s.mgr });
  assert.equal(pending.body.data.process_code, 'XLBV', 'pending and approved details must agree');
});

test('lead: may edit approved reports in scope, may not edit pending reports, not outside scope', opts, async () => {
  const { id, body } = await pendingReport();
  // pending edit by lead: only the lead\'s own proposals are editable
  const pendingEdit = await h.request('PUT', `/api/production-temp/${id}`, { token: s.lead, body: { ...body, tt_ok: 50 } });
  assert.equal(pendingEdit.status, 403, JSON.stringify(pendingEdit.body));

  assert.equal((await approve([id], s.lead)).status, 200, 'lead can approve inside scope');
  const approved = await approvedRow(id);
  const detail = await h.request('GET', `/api/production/${approved.id}`, { token: s.lead });
  assert.equal(detail.status, 200);
  const edit = await h.request('PUT', `/api/production/${approved.id}`, {
    token: s.lead, body: { ...body, tt_ok: 90, actual_output: 90, reason: 'Tổ trưởng chỉnh', expected_updated_at: detail.body.data.updated_at }
  });
  assert.equal(edit.status, 200, JSON.stringify(edit.body));
  assert.equal(Number((await approvedRow(id)).tt_ok), 90);

  const outside = await h.request('GET', `/api/production/${approved.id}`, { token: s.other });
  assert.ok([403, 404].includes(outside.status), `outside-scope manager got ${outside.status}`);
  const outsideEdit = await h.request('PUT', `/api/production/${approved.id}`, { token: s.other, body: { ...body, tt_ok: 1, actual_output: 1, reason: 'x', expected_updated_at: detail.body.data.updated_at } });
  assert.ok([403, 404].includes(outsideEdit.status), `outside-scope edit got ${outsideEdit.status}`);
  assert.equal(Number((await approvedRow(id)).tt_ok), 90);
});

test('worker cannot reach the approved-report edit/approve APIs', opts, async () => {
  const { id, body } = await pendingReport();
  assert.ok([401, 403].includes((await approve([id], s.t1)).status));
  assert.equal((await approve([id])).status, 200);
  const approved = await approvedRow(id);
  assert.equal((await h.request('PUT', `/api/production/${approved.id}`, { token: s.t1, body: { ...body, tt_ok: 1 } })).status, 403);
});

test('reject needs a reason; rejected report leaves the pending queue', opts, async () => {
  const { id } = await pendingReport();
  const bad = await h.request('POST', '/api/production-temp/reject-selected', { token: s.mgr, body: { ids: [id], reason: '' } });
  assert.equal(bad.status, 422);
  const ok = await h.request('POST', '/api/production-temp/reject-selected', { token: s.mgr, body: { ids: [id], reason: 'Sai ca' } });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const pending = await h.request('GET', '/api/production-temp/pending', { token: s.mgr });
  const rows = pending.body.data.reports || pending.body.data;
  assert.ok(!rows.some((r) => r.id === id));
});
