const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const fs = require('node:fs');
const express = require('express');

const BACKEND = path.join(__dirname, '..');

function setup({ role = 'admin', userId = 1, users = { 1: { role: 'admin', status: 'active' }, 7: { role: 'lead', status: 'active' }, 8: { role: 'worker', status: 'inactive' } } } = {}) {
  const sqls = [];
  const audits = [];
  const updateCalls = [];
  const exec = async (sql, params = []) => {
    const s = String(sql).replace(/\s+/g, ' ').trim();
    sqls.push({ sql: s, params });
    if (/^SELECT \(SELECT COUNT\(\*\) FROM users\) AS users_total/i.test(s)) return [[{ users_total: 120, users_active: 110, workers: 100, managers: 6, leads: 10, admins: 2, admin_ops: 2, processes_total: 10, processes_active: 9, machines_total: 40, machines_active: 38, production_reports: 5000, pending_approvals: 17 }], []];
    if (/FROM activity_logs a JOIN users u/i.test(s)) return [[{ id: 3, action: 'CONTROL_USER_LOCKED', username: 'admin' }], []];
    if (/FROM users u LEFT JOIN workers w ON w\.user_id = u\.id\s*(WHERE|ORDER)/i.test(s)) return [[{ id: 7, username: 'lead7', role: 'lead', status: 'active', total_count: 41 }], []];
    if (/^SELECT id, role, status FROM users WHERE id=\?/i.test(s)) { const u = users[params[0]]; return [u ? [{ id: params[0], ...u }] : [], []]; }
    if (/information_schema\.COLUMNS/i.test(s)) return [[{ name: 'id', type: 'bigint' }], []];
    if (/information_schema\.(STATISTICS|KEY_COLUMN_USAGE)/i.test(s)) return [[], []];
    if (/INSERT INTO activity_logs/i.test(s)) { audits.push({ action: params[1], entityType: params[2], entityId: params[3], metadata: JSON.parse(params[5]) }); return [{ affectedRows: 1 }, []]; }
    if (/^SELECT 1 AS ok/i.test(s)) return [[{ ok: 1 }], []];
    if (/information_schema\.tables/i.test(s)) return [[{ total: 2 }], []];
    return [[], []];
  };
  const fakeDb = { promise: () => ({ query: exec }) };
  const fakeAuth = (req, _res, next) => { req.user = { id: userId, username: 'u', role }; req.requestId = 'r1'; next(); };
  const fakeUpdate = { updateUser: async (req, res) => { updateCalls.push({ id: req.params.id, body: req.body, actor: req.user.role }); res.json({ success: true }); } };
  const original = Module._load;
  Module._load = function (request, parent, ...rest) {
    if (/config\/db$/.test(request)) return fakeDb;
    if (/middleware\/authMiddleware$/.test(request)) return fakeAuth;
    if (/controllers\/userUpdateController$/.test(request)) return fakeUpdate;
    return original.call(this, request, parent, ...rest);
  };
  let router;
  try {
    for (const rel of ['routes/adminControlRoutes', 'services/masterControlService', 'services/permissionService', 'services/auditService', 'middleware/permissionMiddleware']) delete require.cache[require.resolve(path.join(BACKEND, rel))];
    router = require(path.join(BACKEND, 'routes/adminControlRoutes'));
  } finally { Module._load = original; }
  const app = express();
  app.use(express.json());
  app.locals.runtimeReadiness = { ready: true, schemaStatus: 'READY', schemaContractVersion: 26, database: 'ok' };
  app.use('/api/admin/control', router);
  return { app, sqls, audits, updateCalls };
}

async function request(app, method, url, body) {
  const server = app.listen(0);
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}${url}`, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: await res.json() };
  } finally { server.closeAllConnections?.(); server.close(); }
}

test('only admin may use Master Control: worker, lead, manager and admin_ops get 403 on every endpoint', async () => {
  for (const role of ['worker', 'lead', 'manager', 'admin_ops']) {
    const { app, updateCalls } = setup({ role, userId: 50 });
    for (const [method, url, body] of [['GET', '/api/admin/control/overview'], ['GET', '/api/admin/control/users'], ['GET', '/api/admin/control/database/tables'], ['PATCH', '/api/admin/control/users/7/status', { status: 'inactive', reason: 'test' }]]) {
      const r = await request(app, method, url, body);
      assert.equal(r.status, 403, `${role} ${method} ${url}`);
      assert.equal(r.body.code, 'ROLE_DENIED');
    }
    assert.equal(updateCalls.length, 0);
  }
});

test('a request without a token is rejected by the real auth middleware', async () => {
  // Load the real auth middleware with a DB stub so no connection pool is opened.
  const original = Module._load;
  Module._load = function (request, parent, ...rest) {
    if (/config\/db$/.test(request)) return { promise: () => ({ query: async () => [[], []] }) };
    return original.call(this, request, parent, ...rest);
  };
  let auth;
  try { delete require.cache[require.resolve(path.join(BACKEND, 'middleware/authMiddleware'))]; auth = require(path.join(BACKEND, 'middleware/authMiddleware')); }
  finally { Module._load = original; }
  const app = express();
  app.use('/x', auth, (_req, res) => res.json({ ok: true }));
  const r = await request(app, 'GET', '/x');
  assert.equal(r.status, 401);
  assert.equal(r.body.code, 'TOKEN_MISSING');
});

test('overview returns real DB counts, readiness and explicit not-available states (no hardcoded healthy)', async () => {
  const { app, sqls } = setup();
  const r = await request(app, 'GET', '/api/admin/control/overview');
  assert.equal(r.status, 200);
  const d = r.body.data;
  assert.equal(d.counts.users.workers, 100);
  assert.equal(d.counts.pendingApprovals, 17);
  assert.equal(d.database.status, 'ok');
  assert.equal(d.readiness.status, 'ready');
  assert.equal(d.backup.status, 'not_available');
  assert.equal(d.backgroundJobs.status, 'not_available');
  assert.equal(d.recentActivity.length, 1);
  assert.deepEqual(d.alerts, []);
  assert.equal(sqls.filter((x) => /COUNT\(\*\)/.test(x.sql)).length, 1, 'all KPI counts come from one statement (one Worker subrequest)');
});

test('overview reports database failure as unavailable instead of healthy', async () => {
  const { app } = setup();
  const control = require(path.join(BACKEND, 'services/masterControlService'));
  const alerts = control.buildSystemAlerts({ readiness: { ready: false, schemaStatus: 'DATABASE_CONTRACT_INVALID' }, databaseOk: false });
  assert.deepEqual(alerts.map((a) => a.code), ['DATABASE_UNREACHABLE', 'READINESS_NOT_READY']);
  assert.ok(app);
});

test('user list is paginated server-side, filters are validated and parameterized', async () => {
  const { app, sqls } = setup();
  let r = await request(app, 'GET', '/api/admin/control/users?search=ng%25uy&role=lead&status=active&page=2&pageSize=500');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.data.pagination, { page: 2, pageSize: 100, total: 41, totalPages: 1 });
  const listSql = sqls.find((x) => /COUNT\(\*\) OVER\(\)/.test(x.sql));
  assert.match(listSql.sql, /LIMIT 100 OFFSET 100/);
  assert.deepEqual(listSql.params, ['%ng\\%uy%', '%ng\\%uy%', '%ng\\%uy%', 'lead', 'active']);
  r = await request(app, 'GET', '/api/admin/control/users?role=root');
  assert.equal(r.status, 400);
  assert.equal(r.body.code, 'CONTROL_ROLE_INVALID');
});

test('database explorer is metadata-only and rejects non-identifier table names; SQL console is disabled', async () => {
  const { app, sqls } = setup();
  let r = await request(app, 'GET', '/api/admin/control/database/tables/users');
  assert.equal(r.status, 200);
  assert.ok(sqls.every((x) => !/^(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE)/i.test(x.sql) || /activity_logs/.test(x.sql)));
  r = await request(app, 'GET', `/api/admin/control/database/tables/${encodeURIComponent('users;DROP TABLE users')}`);
  assert.equal(r.status, 400);
  assert.equal(r.body.code, 'CONTROL_TABLE_INVALID');
  r = await request(app, 'GET', '/api/admin/control/database/tables');
  assert.deepEqual(r.body.data.sqlConsole, { enabled: false, reason: 'READ_ONLY_CREDENTIAL_NOT_CONFIGURED' });
  const source = fs.readFileSync(path.join(BACKEND, 'services/masterControlService.js'), 'utf8');
  assert.doesNotMatch(source, /\b(INSERT INTO|UPDATE \w+ SET|DELETE FROM|DROP TABLE|ALTER TABLE|TRUNCATE)\b/i, 'control read model never writes');
});

test('account lock is reversible: reuses the user update controller with status only, audits, never deletes', async () => {
  const { app, sqls, audits, updateCalls } = setup();
  let r = await request(app, 'PATCH', '/api/admin/control/users/7/status', { status: 'inactive' });
  assert.equal(r.status, 400);
  assert.equal(r.body.code, 'CONTROL_REASON_REQUIRED');

  r = await request(app, 'PATCH', '/api/admin/control/users/7/status', { status: 'inactive', reason: 'Nghỉ phép dài hạn' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.data, { id: 7, status: 'inactive', changed: true });
  assert.deepEqual(updateCalls, [{ id: '7', body: { status: 'inactive' }, actor: 'admin' }]);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].action, 'CONTROL_USER_LOCKED');
  assert.deepEqual(audits[0].metadata.before, { status: 'active' });
  assert.equal(audits[0].metadata.target_role, 'lead');
  assert.equal(audits[0].metadata.reversible, true);
  assert.ok(!sqls.some((x) => /^DELETE/i.test(x.sql)), 'locking a Lead must not delete anything');

  r = await request(app, 'PATCH', '/api/admin/control/users/8/status', { status: 'active', reason: 'Quay lại làm việc' });
  assert.equal(r.status, 200);
  assert.equal(audits.at(-1).action, 'CONTROL_USER_UNLOCKED');

  r = await request(app, 'PATCH', '/api/admin/control/users/1/status', { status: 'inactive', reason: 'self lock' });
  assert.equal(r.body.code, 'CONTROL_SELF_LOCK_FORBIDDEN');
  r = await request(app, 'PATCH', '/api/admin/control/users/7/status', { status: 'deleted', reason: 'xxx' });
  assert.equal(r.body.code, 'CONTROL_STATUS_INVALID');
});

test('Master Control routes are mounted under /api/admin/control without touching /api/admin/master', () => {
  const server = fs.readFileSync(path.join(BACKEND, 'server.js'), 'utf8');
  assert.match(server, /mount\("\/api\/admin\/control", require\("\.\/routes\/adminControlRoutes"\)/);
  assert.match(server, /mount\("\/api\/admin\/master", adminMasterRoutes/);
  assert.ok(server.indexOf('/api/admin/control') < server.indexOf('app.use((req, res) => res.status(404)'));
  const routes = fs.readFileSync(path.join(BACKEND, 'routes/adminControlRoutes.js'), 'utf8');
  assert.match(routes, /router\.use\(auth, role\('admin'\)\)/);
  const master = fs.readFileSync(path.join(BACKEND, 'routes/adminMasterRoutes.js'), 'utf8');
  assert.match(master, /MANAGEMENT_ROLES=\['admin','admin_ops','manager','lead'\]/, 'existing master-data access is unchanged');
});
