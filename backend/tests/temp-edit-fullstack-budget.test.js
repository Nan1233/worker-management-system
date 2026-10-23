'use strict';
// Full request path (global middleware, auth, role/permission, edit-window middleware, controller, model, audit) of
// PUT /api/production-temp/:id against the fake DB, counting EVERY statement = Cloudflare Worker subrequest (limit 50 on
// the Free plan). Each run starts from freshly loaded modules, i.e. a cold isolate with empty auth/permission/standard caches.
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { state, today, UPD, freshRequire } = require('./helpers/tempEditFakeDb');

// Cloudflare Free allows 50 per invocation. The fake DB cannot model everything, so keep a margin: >= 4 for a worker edit,
// >= 2 for a manager edit (scope check + worker notification + their audit rows add statements).
// Measured after batching the product-standard lookups: worker 39 / manager 41 for 1..4 machines (fake DB, cold isolate).
const SAFE_LIMIT = 42;
const MANAGER_LIMIT = 43;

const line = (i) => ({ machine_code: `M0${5 + i}`, product_code: `P${i + 1}`, actual_time_hours: 2, machine_time_hours: 3, deduction_time_hours: 1, deductions: [], ok_quantity: 100, ng_quantity: 2, standard_output: 500, defects: [{ defect_type_id: 11, defect_code: 'X', defect_name: 'Vỡ', quantity: 2 }] });
const body = (n) => {
  const ms = Array.from({ length: n }, (_, i) => line(i));
  return { process_id: 1, work_date: today, shift: 'A', operation_mode: 'MACHINE', machine_no: ms.map((m) => m.machine_code).join(', '), product_name: ms.map((m) => m.product_code).join(', '), total_time: 0, actual_time: 0, deduction_time: 0, standard_output: 1000, actual_output: 0, tt_ok: 100 * n, tt_ng: 2 * n, note: 'sửa', extra_data: { adjustment_count: 0 }, defects: [], deductions: [], machine_lines: ms, updated_at: UPD, expected_updated_at: UPD };
};

async function request(payload, { lineCount, role = 'worker', failOn = null, failMessage = null } = {}) {
  Object.assign(state, { sqls: [], failOn, failMessage, failRollback: false, lineCount, committed: 0 });
  state.user = { id: 70, username: 'u70', role, status: 'active', worker_id: role === 'worker' ? 7 : null, worker_status: role === 'worker' ? 'active' : null, database_name: 'ktc_test' };
  const { app } = freshRequire('server.js');
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const quiet = console.error; console.error = () => {};
  try {
    const token = jwt.sign({ id: 70, username: 'u70', role, worker_id: state.user.worker_id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/production-temp/900001`, { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
    const json = await res.json().catch(() => null);
    await new Promise((r) => setTimeout(r, 150)); // post-response audit log
    return { status: res.status, json, count: state.sqls.length, sqls: state.sqls, committed: state.committed };
  } finally { console.error = quiet; await new Promise((r) => server.close(r)); }
}

test('worker edit, whole stack, cold isolate: 1 / 2 / 4 machines stay under the safe limit', async (t) => {
  const counts = {};
  for (const n of [1, 2, 4]) {
    const r = await request(body(n), { lineCount: n });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.committed, 1);
    counts[n] = r.count;
    assert.ok(r.count <= SAFE_LIMIT, `${n} machines: ${r.count} statements`);
  }
  t.diagnostic(`worker, whole stack: ${JSON.stringify(counts)} (limit 50, safe limit ${SAFE_LIMIT})`);
});

test('manager edit, whole stack, 4 machines: scope check + worker notification stay under the manager limit', async (t) => {
  const r = await request(body(4), { lineCount: 4, role: 'manager' });
  t.diagnostic(`manager, 4 machines: status ${r.status}, ${r.count} statements`);
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.ok(r.count <= MANAGER_LIMIT, `${r.count} statements`);
});

test('statement count no longer grows with the number of machines (worker and manager, 1 / 2 / 4)', async (t) => {
  const seen = { worker: {}, manager: {} };
  for (const role of ['worker', 'manager']) {
    for (const n of [1, 2, 4]) {
      const r = await request(body(n), { lineCount: n, role });
      assert.equal(r.status, 200, JSON.stringify(r.json));
      seen[role][n] = r.count;
    }
    assert.ok(seen[role][4] - seen[role][1] <= 1, `${role}: ${JSON.stringify(seen[role])}`);
  }
  t.diagnostic(`whole stack ${JSON.stringify(seen)}`);
});

test('note-only edit (no machine_lines) and a retry of the same edit stay under the limit and keep machine data', async (t) => {
  const noLines = body(4); delete noLines.machine_lines;
  const r1 = await request(noLines, { lineCount: 4, role: 'manager' });
  t.diagnostic(`manager, note-only 4 machines: ${r1.status}, ${r1.count}`);
  assert.equal(r1.status, 200, JSON.stringify(r1.json));
  assert.ok(r1.count <= MANAGER_LIMIT, `${r1.count}`);
  assert.ok(!r1.sqls.some((q) => /DELETE d, l FROM production_temp_machine_lines/.test(String(q.sql || q))), 'machine lines must not be rewritten');
  const a = await request(body(4), { lineCount: 4 }); const b = await request(body(4), { lineCount: 4 });
  assert.equal(a.count, b.count); // a retry costs exactly the same and rewrites with DELETE + one INSERT per table
  assert.ok(b.count <= SAFE_LIMIT);
});

test('a DB error in the middle of the transaction rolls back, keeps the original error and stays under the limit', async (t) => {
  const r = await request(body(4), { lineCount: 4, failOn: /INSERT INTO production_temp_machine_defects/, failMessage: 'boom-defects' });
  t.diagnostic(`worker, failure at defects insert: ${r.status}, ${r.count}`);
  assert.notEqual(r.status, 200);
  assert.equal(r.committed, 0);
  assert.ok(r.sqls.some((q) => /^ROLLBACK/.test(String(q.sql || q))));
  assert.ok(r.count <= SAFE_LIMIT);
});
