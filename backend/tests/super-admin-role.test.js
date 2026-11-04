const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const fs = require('node:fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

const BACKEND = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(BACKEND, rel), 'utf8');

function withStubs(stubs, relPaths) {
  const original = Module._load;
  Module._load = function (request, parent, ...rest) {
    for (const [key, value] of Object.entries(stubs)) if (request.endsWith(key)) return value;
    return original.call(this, request, parent, ...rest);
  };
  try {
    return relPaths.map((rel) => { delete require.cache[require.resolve(path.join(BACKEND, rel))]; return require(path.join(BACKEND, rel)); });
  } finally { Module._load = original; }
}

const run = (mw, req) => new Promise((resolve) => {
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { resolve({ status: this.statusCode, body, req }); return this; } };
  mw(req, res, (error) => resolve({ status: error ? 'error' : 'next', error, req }));
});

test('role model: super_admin authorizes as admin plus a DB-derived flag; admin unchanged', () => {
  const roles = require('../utils/roles');
  assert.equal(roles.effectiveRole('super_admin'), 'admin');
  assert.equal(roles.effectiveRole(' SUPER_ADMIN '), 'admin');
  assert.equal(roles.effectiveRole('admin'), 'admin');
  assert.equal(roles.effectiveRole('manager'), 'manager');
  assert.deepEqual(roles.publicRoleFields('super_admin'), { role: 'admin', is_super_admin: true });
  assert.deepEqual(roles.publicRoleFields('admin'), { role: 'admin', is_super_admin: false });
  assert.equal(roles.isSuperAdminActor({ role: 'admin', is_super_admin: 'true' }), false, 'only a real boolean from the middleware counts');
});

for (const middleware of ['middleware/authMiddleware', 'middleware/fastAuthMiddleware']) {
  test(`${middleware}: super-admin flag comes from the DB row; a forged JWT cannot raise privileges`, async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-super-admin-role-test-0123456789';
    const dbRoles = { 1: 'super_admin', 60002: 'admin', 5: 'manager' };
    const fakeDb = { promise: () => ({ query: async (_sql, params) => [[{ id: params[0], username: `u${params[0]}`, role: dbRoles[params[0]], status: 'active', worker_id: null, worker_status: null }], []] }) };
    const cache = { getOrLoadAuthUser: async (_key, loader) => loader(), setCachedAuthUser() {} };
    const [auth] = withStubs({ 'config/db': fakeDb, 'utils/authUserCache': cache }, [middleware]);
    const token = (payload) => `Bearer ${jwt.sign(payload, process.env.JWT_SECRET)}`;

    let r = await run(auth, { headers: { authorization: token({ id: 1, username: 'superadmin', role: 'admin' }) } });
    assert.equal(r.status, 'next');
    assert.equal(r.req.user.role, 'admin');
    assert.equal(r.req.user.is_super_admin, true);

    // Existing admin (e.g. nagata 60002) keeps admin; a JWT claiming super_admin is ignored.
    r = await run(auth, { headers: { authorization: token({ id: 60002, username: 'nagata', role: 'super_admin', is_super_admin: true }) } });
    assert.equal(r.req.user.role, 'admin');
    assert.equal(r.req.user.is_super_admin, false);

    r = await run(auth, { headers: { authorization: token({ id: 5, username: 'm', role: 'super_admin', is_super_admin: true }) } });
    assert.equal(r.req.user.role, 'manager');
    assert.equal(r.req.user.is_super_admin, false);
  });
}

test('super admin passes every admin route guard; worker/lead/manager/admin_ops still do not', async () => {
  const role = require('../middleware/roleMiddleware');
  assert.equal((await run(role('admin'), { user: { role: 'admin', is_super_admin: true } })).status, 'next');
  for (const r of ['worker', 'lead', 'manager', 'admin_ops']) assert.equal((await run(role('admin'), { user: { role: r } })).status, 403);
});

test('permissions: super admin and admin both have every permission; overrides on them are refused', async () => {
  const fakeDb = { promise: () => ({ query: async (sql, params) => {
    if (/information_schema\.tables/i.test(sql)) return [[{ total: 2 }], []];
    if (/^SELECT id,role FROM users/i.test(sql)) return [[{ id: params[0], role: params[0] === 1 ? 'super_admin' : 'admin' }], []];
    return [[], []];
  } }) };
  const [service] = withStubs({ 'config/db': fakeDb }, ['services/permissionService']);
  const all = service.getPermissionList().map((p) => p.code).sort();
  assert.deepEqual([...await service.getEffectivePermissions({ id: 1, role: 'super_admin' })].sort(), all);
  assert.deepEqual([...await service.getEffectivePermissions({ id: 60002, role: 'admin' })].sort(), all, 'existing admins keep full permissions');
  assert.equal(await service.hasPermission({ id: 1, role: 'super_admin' }, 'PERMISSION_MANAGE'), true);
  await assert.rejects(() => service.setUserPermission(1, 'REPORT_EXPORT', false), (e) => e.code === 'PERMISSION_ADMIN_IMMUTABLE');
  await assert.rejects(() => service.setRolePermission('super_admin', 'REPORT_EXPORT', false), (e) => e.code === 'PERMISSION_ADMIN_IMMUTABLE');
});

test('user management scope: only a super admin may manage admin / super_admin accounts', async () => {
  const { assertUserManagementScope } = require('../services/processAuthorizationService');
  const admin = { id: 60002, role: 'admin', is_super_admin: false };
  const superAdmin = { id: 1, role: 'admin', is_super_admin: true };
  for (const target of [{ id: 1, role: 'super_admin' }, { id: 60003, role: 'admin' }]) {
    await assert.rejects(() => assertUserManagementScope(admin, target), /phạm vi quản lý/);
    assert.equal(await assertUserManagementScope(superAdmin, target), true);
  }
  assert.equal(await assertUserManagementScope(admin, { id: 9, role: 'manager' }), true, 'admins keep managing manager/lead/worker');
});

test('privileged target guard: admin is blocked (403 + security audit), super admin and normal targets pass', async () => {
  const audits = [];
  const roles = { 1: 'super_admin', 60003: 'admin', 9: 'worker' };
  const fakeDb = { promise: () => ({ query: async (_sql, params) => [[{ id: params[0], role: roles[params[0]] }], []] }) };
  const [guardModule] = withStubs({ 'config/db': fakeDb, 'services/auditService': { logActivity: async (entry) => { audits.push(entry); } } }, ['middleware/privilegedTargetGuard']);
  const guard = guardModule.guardPrivilegedTarget();
  const admin = { id: 60002, role: 'admin', is_super_admin: false };
  for (const id of ['1', '60003']) {
    const r = await run(guard, { params: { id }, user: admin, method: 'PUT', originalUrl: `/api/users/${id}`, headers: {} });
    assert.equal(r.status, 403);
    assert.equal(r.body.code, 'PRIVILEGED_TARGET_FORBIDDEN');
  }
  assert.deepEqual(audits.map((a) => a.action), ['SECURITY_PRIVILEGED_TARGET_DENIED', 'SECURITY_PRIVILEGED_TARGET_DENIED']);
  assert.equal((await run(guard, { params: { id: '1' }, user: { id: 2, role: 'admin', is_super_admin: true }, method: 'PUT', headers: {} })).status, 'next');
  assert.equal((await run(guard, { params: { id: '9' }, user: admin, method: 'PUT', headers: {} })).status, 'next');
});

test('no API path can create or promote an account to admin / super_admin (no self-upgrade)', () => {
  assert.match(read('controllers/userCreateController.js'), /if \(!\['manager', 'lead', 'worker'\]\.includes\(role\)\) return res\.status\(400\)/);
  const update = read('controllers/userUpdateController.js');
  assert.doesNotMatch(update, /payload\.role\s*=/, 'updateUser never writes users.role');
  const routes = read('routes/userRoutes.js');
  for (const route of ["router.put('/:id', permission('USER_EDIT'), guardPrivilegedTarget()", "router.delete('/:id/permanent', guardPrivilegedTarget()", "router.post('/:id/promote-lead', guardPrivilegedTarget()", "router.post('/:id/promote-manager', guardPrivilegedTarget()"]) assert.ok(routes.includes(route), route);
  assert.match(read('routes/permissionRoutes.js'), /guardPrivilegedTarget\(\(req\)=>req\.params\.userId\)/);
  assert.match(read('routes/adminControlRoutes.js'), /router\.patch\('\/users\/:id\/status', permission\('USER_EDIT'\), guardPrivilegedTarget\(\)/);
  const auth = read('controllers/authController.js');
  assert.match(auth, /\["super_admin", "admin", "admin_ops", "manager", "lead"\]/, 'super admin logs in with username + password');
  assert.equal((auth.match(/\.\.\.publicRoleFields\(/g) || []).length, 3, 'JWT, login and refresh responses present super_admin as admin + flag');
});

test('bootstrap script: strong password required, bcrypt cost 10, SQL carries only the hash and is run-once', async () => {
  const script = require('../scripts/createSuperAdmin');
  assert.equal(script.BCRYPT_COST, 10);
  assert.deepEqual([script.USERNAME, script.FULL_NAME, script.ROLE], ['superadmin', 'KTC Super Administrator', 'super_admin']);
  for (const weak of ['short1!A', 'alllowercase-123456', 'NoDigitsHere!!!!', 'superadmin#Strong2026', 'NoSpecialChar12345']) assert.throws(() => script.assertStrongPassword(weak), /chưa đủ mạnh/);
  const password = 'Vk7#mQ2!xR9@tL4p';
  assert.equal(script.assertStrongPassword(password), password);
  const hash = await bcrypt.hash(password, script.BCRYPT_COST);
  const sql = script.buildBootstrapSql(hash);
  assert.ok(sql.includes(hash));
  assert.ok(!sql.includes(password), 'plaintext never appears');
  assert.match(sql, /WHERE NOT EXISTS \(SELECT 1 FROM users WHERE role = 'super_admin' OR username = 'superadmin'\)/);
  assert.match(sql, /FROM DUAL/);
  assert.doesNotMatch(sql, /\b(UPDATE|DELETE|DROP|ALTER|TRUNCATE)\b/i, 'no existing account or table is changed');
  assert.throws(() => script.buildBootstrapSql('plaintext'), /Hash bcrypt không hợp lệ/);
  const source = read('scripts/createSuperAdmin.js');
  assert.doesNotMatch(source, /KTC_SUPERADMIN_PASSWORD\s*=\s*['"]/);
  assert.equal(await bcrypt.compare(password, hash), true, 'authController bcrypt.compare accepts the hash');
});
