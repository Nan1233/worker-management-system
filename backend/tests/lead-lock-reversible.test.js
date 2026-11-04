const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const fs = require('node:fs');

const BACKEND = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(BACKEND, rel), 'utf8');

// Decision 2026-11-04: "Khóa" on a Lead is a reversible lock, never a permanent delete.
test('PUT /api/users/:id no longer routes a Lead status change to permanent deletion', () => {
  const routes = read('routes/userRoutes.js');
  assert.doesNotMatch(routes, /permanentDeleteLeadFromLegacyRemove/);
  assert.match(routes, /router\.put\('\/:id', permission\('USER_EDIT'\), processAssignmentCapacity, updateUserController\.updateUser\);/);
  // Permanent deletion stays an explicit, separate endpoint.
  assert.match(routes, /router\.delete\('\/:id\/permanent'/);
});

function loadController(target, { auditFails = false } = {}) {
  const sqls = [];
  const audits = [];
  const conn = {
    query: async (sql, params = []) => {
      const s = String(sql).replace(/\s+/g, ' ').trim();
      sqls.push({ sql: s, params });
      if (/^SELECT u\.id,u\.role,u\.status/.test(s)) return [[target], []];
      return [{ affectedRows: 1 }, []];
    },
    release() {},
  };
  const stubs = {
    'config/db': { promise: () => ({ getConnection: async () => conn, query: conn.query }) },
    'services/processAuthorizationService': { assertUserManagementScope: async () => true, getActorProcessScope: async () => null },
    'services/refreshSessionService': { revokeAllUserFamilies: async (id) => { sqls.push({ sql: `REVOKE_SESSIONS ${id}` }); } },
    'services/auditService': { logActivity: async (entry) => { if (auditFails) throw new Error('audit down'); audits.push(entry); } },
    'utils/workerProfileCache': { clearWorkerProfile() {} },
    'utils/authUserCache': { deleteCachedAuthUser() {} },
  };
  const original = Module._load;
  Module._load = function (request, parent, ...rest) {
    for (const [key, value] of Object.entries(stubs)) if (request.endsWith(key)) return value;
    return original.call(this, request, parent, ...rest);
  };
  try {
    delete require.cache[require.resolve(path.join(BACKEND, 'controllers/userUpdateController'))];
    return { controller: require(path.join(BACKEND, 'controllers/userUpdateController')), sqls, audits };
  } finally { Module._load = original; }
}

const call = (controller, req) => new Promise((resolve) => {
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { resolve({ status: this.statusCode, body }); return this; } };
  controller.updateUser(req, res);
});

test('locking a Lead flips users.status only, revokes sessions, audits USER_LOCKED and deletes nothing', async () => {
  const { controller, sqls, audits } = loadController({ id: 7, role: 'lead', status: 'active', worker_id: 70 });
  const r = await call(controller, { params: { id: '7' }, body: { status: 'inactive' }, user: { id: 1, role: 'admin' }, headers: {} });
  assert.equal(r.status, 200);
  assert.ok(sqls.some((x) => /^UPDATE users SET/.test(x.sql) && x.params.includes('inactive')));
  assert.ok(sqls.some((x) => x.sql === 'REVOKE_SESSIONS 7'));
  assert.ok(!sqls.some((x) => /^DELETE/i.test(x.sql)), 'no row may be deleted');
  assert.equal(audits.length, 1);
  assert.equal(audits[0].action, 'USER_LOCKED');
  assert.deepEqual(audits[0].metadata.before, { status: 'active' });
  assert.deepEqual(audits[0].metadata.after, { status: 'inactive' });
  assert.equal(audits[0].metadata.reversible, true);
});

test('unlocking restores access and audits USER_UNLOCKED; Master Control calls are not double-audited', async () => {
  let ctx = loadController({ id: 7, role: 'lead', status: 'inactive', worker_id: 70 });
  let r = await call(ctx.controller, { params: { id: '7' }, body: { status: 'active' }, user: { id: 1, role: 'admin' }, headers: {} });
  assert.equal(r.status, 200);
  assert.equal(ctx.audits[0].action, 'USER_UNLOCKED');
  ctx = loadController({ id: 7, role: 'lead', status: 'active', worker_id: 70 });
  r = await call(ctx.controller, { params: { id: '7' }, body: { status: 'inactive' }, user: { id: 1, role: 'admin' }, headers: {}, _statusAuditHandled: true });
  assert.equal(r.status, 200);
  assert.equal(ctx.audits.length, 0);
});

test('MasterData lock confirmation states the account is not deleted', () => {
  const page = fs.readFileSync(path.join(BACKEND, '..', 'frontend/src/pages/admin/MasterData.tsx'), 'utf8');
  assert.match(page, /KHÔNG bị xóa/);
  assert.match(page, /window\.confirm\(message\)/);
});
