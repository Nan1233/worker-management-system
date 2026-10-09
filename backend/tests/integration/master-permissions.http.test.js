'use strict';

// Real HTTP + real database: the master-data permission contract the UI mirrors.
//   admin   : machines/standards/deductions/defects CRUD, processes CRUD
//   manager : machines/standards/deductions/defects CRUD (own scope), processes read-only
//   lead    : machines/standards/deductions CRUD (own scope), NO defects, processes read-only
//   worker  : nothing

const test = require('node:test');
const assert = require('node:assert/strict');
const h = require('./harness');

const opts = { skip: h.skipReason };
const s = {};
const auth = (token) => ({ token });

test.before(async () => {
  if (!h.enabled) return;
  const { db } = await h.start();
  s.db = db;
  await h.createUser(db, { username: 'adm', role: 'admin' });
  await h.createUser(db, { username: 'mgr', role: 'manager', processCodes: ['XLBV'] });
  await h.createUser(db, { username: 'lead', role: 'lead', processCodes: ['XLBV'] });
  await h.createUser(db, { username: 'W-MASTER', role: 'worker', workerCode: 'W-MASTER', processCodes: ['XLBV'] });
  s.admin = (await h.loginManagement('adm', 'Passw0rd!x')).token;
  s.manager = (await h.loginManagement('mgr', 'Passw0rd!x')).token;
  s.lead = (await h.loginManagement('lead', 'Passw0rd!x')).token;
  s.worker = (await h.loginWorker('W-MASTER')).token;
  const [[xlbv]] = await db.query("SELECT id FROM processes WHERE process_code='XLBV'");
  const [[gc]] = await db.query("SELECT id FROM processes WHERE process_code='GC'");
  s.xlbv = xlbv.id;
  s.gc = gc.id;
  assert.ok(s.admin && s.manager && s.lead && s.worker);
});

test.after(async () => { if (h.enabled) await h.stop(); });

test('admin can create, edit and disable a process', opts, async () => {
  const create = await h.request('POST', '/api/admin/master/processes', { ...auth(s.admin), body: { process_code: 'TST1', process_name: 'Công đoạn thử', description: 'it' } });
  assert.equal(create.status, 201, JSON.stringify(create.body));
  const id = create.body.data.id;

  const dup = await h.request('POST', '/api/admin/master/processes', { ...auth(s.admin), body: { process_code: 'TST1', process_name: 'Trùng' } });
  assert.equal(dup.status, 409);

  const rename = await h.request('PUT', `/api/admin/master/processes/${id}`, { ...auth(s.admin), body: { process_name: 'Công đoạn thử (đổi tên)' } });
  assert.equal(rename.status, 200, JSON.stringify(rename.body));
  assert.equal((await s.db.query('SELECT process_name FROM processes WHERE id=?', [id]))[0][0].process_name, 'Công đoạn thử (đổi tên)');

  const disable = await h.request('PUT', `/api/admin/master/processes/${id}`, { ...auth(s.admin), body: { status: 'inactive' } });
  assert.equal(disable.status, 200, JSON.stringify(disable.body));
  assert.equal((await s.db.query('SELECT status FROM processes WHERE id=?', [id]))[0][0].status, 'inactive');
});

test('processes: manager may read, manager and lead may not write, lead has no process catalogue', opts, async () => {
  assert.equal((await h.request('GET', '/api/admin/master/processes', auth(s.manager))).status, 200);
  // Effective contract: the controller limits leads to machines/standards/deductions,
  // so even reading the process catalogue is forbidden (leads get their process list
  // from /api/users/options/processes instead).
  assert.equal((await h.request('GET', '/api/admin/master/processes', auth(s.lead))).status, 403);
  const optionList = await h.request('GET', '/api/users/options/processes', auth(s.lead));
  assert.equal(optionList.status, 200, JSON.stringify(optionList.body));
  for (const [name, token] of [['manager', s.manager], ['lead', s.lead]]) {
    const write = await h.request('POST', '/api/admin/master/processes', { ...auth(token), body: { process_code: `X${name}`, process_name: 'không được' } });
    assert.equal(write.status, 403, `${name} write must be forbidden`);
  }
  assert.equal((await s.db.query("SELECT COUNT(*) c FROM processes WHERE process_code IN ('Xmanager','Xlead')"))[0][0].c, 0);
  const worker = await h.request('GET', '/api/admin/master/processes', auth(s.worker));
  assert.ok([401, 403].includes(worker.status), `worker got ${worker.status}`);
});

test('lead: machines and deductions are allowed inside own process scope only', opts, async () => {
  const ok = await h.request('POST', '/api/admin/master/machines', { ...auth(s.lead), body: { process_id: s.xlbv, machine_code: 'LEAD-M1', machine_name: 'Máy của tổ trưởng' } });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  const outside = await h.request('POST', '/api/admin/master/machines', { ...auth(s.lead), body: { process_id: s.gc, machine_code: 'LEAD-M2', machine_name: 'Ngoài phạm vi' } });
  assert.equal(outside.status, 403, JSON.stringify(outside.body));
  const deduction = await h.request('POST', '/api/admin/master/deductions', { ...auth(s.lead), body: { process_id: s.xlbv, deduction_code: 'LEAD_DED', deduction_name: 'Trừ giờ thử', sort_order: 99 } });
  assert.equal(deduction.status, 201, JSON.stringify(deduction.body));
  const list = await h.request('GET', '/api/admin/master/machines', auth(s.lead));
  assert.equal(list.status, 200);
  assert.ok(list.body.data.every((m) => Number(m.process_id) === s.xlbv), 'lead list is scoped to own processes');
});

test('lead: the defect catalogue is forbidden (the UI hides it)', opts, async () => {
  assert.equal((await h.request('GET', '/api/admin/master/defects', auth(s.lead))).status, 403);
  const create = await h.request('POST', '/api/admin/master/defects', { ...auth(s.lead), body: { process_id: s.xlbv, defect_code: 'LEAD_DEF', defect_name: 'Lỗi thử' } });
  assert.equal(create.status, 403);
});

test('manager: defect catalogue allowed in scope, process write forbidden', opts, async () => {
  assert.equal((await h.request('GET', '/api/admin/master/defects', auth(s.manager))).status, 200);
  const create = await h.request('POST', '/api/admin/master/defects', { ...auth(s.manager), body: { process_id: s.xlbv, defect_code: 'MGR_DEF', defect_name: 'Lỗi quản lý' } });
  assert.equal(create.status, 201, JSON.stringify(create.body));
});

test('worker cannot use master data endpoints', opts, async () => {
  for (const resource of ['machines', 'standards', 'deductions', 'defects']) {
    const res = await h.request('GET', `/api/admin/master/${resource}`, auth(s.worker));
    assert.ok([401, 403].includes(res.status), `${resource}: ${res.status}`);
  }
});
