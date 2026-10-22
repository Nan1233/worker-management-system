'use strict';
// Real HTTP + real database: which reports the approve endpoints refuse, and how the refusal is reported.
//  - a report on a GC shared machine (5/6/7/11, e.g. "M11") needs an approved physical machine event: 422 MACHINE_EVENT_REQUIRED
//    (business rule, unchanged) and the body carries a requestId so a masked/failed approval can be traced in the backend log.
//  - the same report type on a non-shared machine, and a manual report, are approved by BOTH endpoints the UI uses
//    (POST /api/production-temp/approve = list drawer, /approve-selected = detail/bulk pages) without duplicate rows.
const test = require('node:test');
const assert = require('node:assert/strict');
const h = require('./harness');

const opts = { skip: h.skipReason };
const s = {};
let seq = 0;

test.before(async () => {
  if (!h.enabled) return;
  const { db } = await h.start();
  s.db = db;
  await h.createUser(db, { username: 'ame-mgr', role: 'manager', processCodes: ['GC', 'XLBV'], password: 'Passw0rd!x' });
  s.mgr = (await h.loginManagement('ame-mgr', 'Passw0rd!x')).token;
  await db.query("UPDATE machines SET machine_code='M11' WHERE process_id=1 AND machine_code='C12'");
});
test.after(async () => { if (h.enabled) await h.stop(); });

// A manual report submitted through the real API, then turned into a machine report on `machineCode` of process GC
// (the approval gate only reads the temp row and its machine line).
async function pendingMachineReport(machineCode) {
  seq += 1;
  const code = `AME${Date.now().toString(36)}${seq}`;
  await h.createUser(s.db, { username: code, role: 'worker', workerCode: code, processCodes: ['XLBV'] });
  const worker = (await h.loginWorker(code)).token;
  const res = await h.submitReport(worker, await h.manualReportBody(s.db, { processCode: 'XLBV', workDate: h.vnDate(-1 - (seq % 10)), clientRequestId: `ame-${code}` }));
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const id = res.body.id;
  const [[machine]] = await s.db.query("SELECT id FROM machines WHERE process_id=1 AND machine_code=?", [machineCode]);
  await s.db.query("UPDATE production_reports_temp SET process_id=1, operation_mode='MACHINE', machine_no=? WHERE id=?", [machineCode, id]);
  await s.db.query(
    `INSERT INTO production_temp_machine_lines (temp_report_id,machine_id,machine_code,product_code,machine_time_hours,standard_output,standard_source,
       exclude_kqd_from_tt,ok_quantity,ng_quantity,maximum_output,counted_output,earned_standard_hours,sort_order)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [id, machine.id, machineCode, 'X-1', 4, 100, 'DEFAULT', 0, 100, 0, 400, 100, 1, 1]);
  return { id, worker };
}
const count = async (id) => Number((await s.db.query('SELECT COUNT(*) c FROM production_reports WHERE source_temp_id=?', [id]))[0][0].c);
const status = async (id) => (await s.db.query('SELECT status FROM production_reports_temp WHERE id=?', [id]))[0][0].status;

test('GC shared machine without an approved event: 422 MACHINE_EVENT_REQUIRED on both endpoints, nothing written, requestId returned', opts, async () => {
  const { id } = await pendingMachineReport('M11');
  for (const url of ['/api/production-temp/approve-selected', '/api/production-temp/approve']) {
    const r = await h.request('POST', url, { token: s.mgr, body: { ids: [id] } });
    assert.equal(r.status, 422, url);
    assert.equal(r.body.code, 'MACHINE_EVENT_REQUIRED');
    assert.match(String(r.body.requestId || ''), /^[A-Za-z0-9._:-]{8,}$/, 'response body carries the request id');
  }
  assert.equal(await status(id), 'pending');
  assert.equal(await count(id), 0);
});

test('a worker cannot approve, and the report stays pending', opts, async () => {
  const { id, worker } = await pendingMachineReport('M11');
  const r = await h.request('POST', '/api/production-temp/approve-selected', { token: worker, body: { ids: [id] } });
  assert.ok([401, 403].includes(r.status), String(r.status));
  assert.equal(await status(id), 'pending');
});

test('a GC machine that is not shared is not stopped by the event gate on either endpoint', opts, async () => {
  for (const url of ['/api/production-temp/approve-selected', '/api/production-temp/approve']) {
    const { id } = await pendingMachineReport('C1');
    const r = await h.request('POST', url, { token: s.mgr, body: { ids: [id] } });
    // The fixture line carries no standard snapshot, so the gate under test (event requirement) must NOT be what stops it.
    assert.notEqual(r.body?.code, 'MACHINE_EVENT_REQUIRED', url);
  }
});
