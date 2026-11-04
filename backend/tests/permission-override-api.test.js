const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

const BACKEND = path.join(__dirname, '..');

// In-memory fake of the two override tables + users + activity_logs, speaking the mysql2/promise shape.
function createFakeDb({ users = { 7: 'lead', 8: 'worker', 9: 'manager', 10: 'admin_ops', 1: 'admin' }, failAudit = false } = {}) {
  const state = { role: new Map(), user: new Map(), activity: [], log: [] };
  const exec = async (sql, params = []) => {
    const s = String(sql).replace(/\s+/g, ' ').trim();
    state.log.push(s);
    if (/information_schema\.tables/i.test(s)) return [[{ total: 2 }], []];
    if (/^SELECT id,role FROM users/i.test(s)) { const role = users[params[0]]; return [role ? [{ id: params[0], role }] : [], []]; }
    if (/^SELECT allowed FROM role_permission_overrides/i.test(s)) { const v = state.role.get(`${params[0]}:${params[1]}`); return [v === undefined ? [] : [{ allowed: v }], []]; }
    if (/^SELECT allowed FROM user_permission_overrides/i.test(s)) { const v = state.user.get(`${params[0]}:${params[1]}`); return [v === undefined ? [] : [{ allowed: v }], []]; }
    if (/^INSERT INTO role_permission_overrides/i.test(s)) { state.pending.push(() => state.role.set(`${params[0]}:${params[1]}`, params[2])); return [{ affectedRows: 1 }, []]; }
    if (/^INSERT INTO user_permission_overrides/i.test(s)) { state.pending.push(() => state.user.set(`${params[0]}:${params[1]}`, params[2])); return [{ affectedRows: 1 }, []]; }
    if (/^DELETE FROM role_permission_overrides/i.test(s)) { state.pending.push(() => state.role.delete(`${params[0]}:${params[1]}`)); return [{ affectedRows: 1 }, []]; }
    if (/^DELETE FROM user_permission_overrides/i.test(s)) { state.pending.push(() => state.user.delete(`${params[0]}:${params[1]}`)); return [{ affectedRows: 1 }, []]; }
    if (/^INSERT INTO activity_logs/i.test(s)) {
      if (failAudit) throw Object.assign(new Error('audit down'), { code: 'ER_AUDIT' });
      state.pending.push(() => state.activity.push({ userId: params[0], action: params[1], entityType: params[2], entityId: params[3], metadata: JSON.parse(params[5]) }));
      return [{ affectedRows: 1 }, []];
    }
    if (/^SELECT permission_code,allowed FROM role_permission_overrides WHERE role=\?/i.test(s)) return [[...state.role].filter(([k]) => k.startsWith(`${params[0]}:`)).map(([k, v]) => ({ permission_code: k.split(':')[1], allowed: v })), []];
    if (/^SELECT permission_code,allowed FROM user_permission_overrides WHERE user_id=\?/i.test(s)) return [[...state.user].filter(([k]) => k.startsWith(`${params[0]}:`)).map(([k, v]) => ({ permission_code: k.split(':')[1], allowed: v })), []];
    throw new Error(`unexpected SQL: ${s}`);
  };
  state.pending = [];
  const connection = {
    query: (sql, params) => exec(sql, params),
    beginTransaction: async () => { state.log.push('BEGIN'); state.pending = []; },
    commit: async () => { state.log.push('COMMIT'); state.pending.forEach((fn) => fn()); state.pending = []; },
    rollback: async () => { state.log.push('ROLLBACK'); state.pending = []; },
    release: () => {},
  };
  const promiseApi = {
    query: async (sql, params) => { const out = await exec(sql, params); state.pending.forEach((fn) => fn()); state.pending = []; return out; },
    getConnection: async () => connection,
  };
  return { state, db: { promise: () => promiseApi } };
}

function load(fake) {
  const original = Module._load;
  Module._load = function (request, parent, ...rest) {
    if (/config\/db$/.test(request)) return fake.db;
    return original.call(this, request, parent, ...rest);
  };
  try {
    for (const rel of ['services/permissionService', 'services/auditService', 'controllers/permissionController']) delete require.cache[require.resolve(path.join(BACKEND, rel))];
    return { service: require(path.join(BACKEND, 'services/permissionService')), controller: require(path.join(BACKEND, 'controllers/permissionController')) };
  } finally { Module._load = original; }
}

function callController(handler, { params, body, user = { id: 1, role: 'admin' } }) {
  return new Promise((resolve, reject) => {
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(payload) { resolve({ status: this.statusCode, body: payload }); return this; } };
    handler({ params, body, user, requestId: 'req-1', headers: {}, ip: '127.0.0.1' }, res, (error) => (error ? reject(error) : resolve({ status: 'next' })));
  });
}

test('controller and service share one contract (the methods the controller calls exist)', () => {
  const { service } = load(createFakeDb());
  assert.equal(typeof service.setRolePermission, 'function');
  assert.equal(typeof service.setUserPermission, 'function');
  const source = require('node:fs').readFileSync(path.join(BACKEND, 'controllers/permissionController.js'), 'utf8');
  assert.doesNotMatch(source, /setRoleOverride|setUserOverride/);
});

test('role override: grant, revoke and default (null deletes the row); every change audited', async () => {
  const fake = createFakeDb();
  const { controller, service } = load(fake);
  let r = await callController(controller.setRole, { params: { role: 'lead', code: 'REPORT_EXPORT' }, body: { allowed: false } });
  assert.equal(r.status, 200);
  assert.equal(fake.state.role.get('lead:REPORT_EXPORT'), 0);
  assert.equal((await service.getEffectivePermissions({ id: 7, role: 'lead' })).has('REPORT_EXPORT'), false);

  r = await callController(controller.setRole, { params: { role: 'lead', code: 'REPORT_EXPORT' }, body: { allowed: true } });
  assert.equal(fake.state.role.get('lead:REPORT_EXPORT'), 1);

  r = await callController(controller.setRole, { params: { role: 'lead', code: 'REPORT_EXPORT' }, body: { allowed: null } });
  assert.equal(r.status, 200);
  assert.equal(fake.state.role.has('lead:REPORT_EXPORT'), false, 'default removes the override instead of storing null');
  assert.equal((await service.getEffectivePermissions({ id: 7, role: 'lead' })).has('REPORT_EXPORT'), true, 'back to inherited default');

  assert.deepEqual(fake.state.activity.map((a) => a.action), ['PERMISSION_OVERRIDE_REVOKED', 'PERMISSION_OVERRIDE_GRANTED', 'PERMISSION_OVERRIDE_CLEARED']);
  assert.deepEqual(fake.state.activity.map((a) => [a.metadata.before, a.metadata.after]), [[null, false], [false, true], [true, null]]);
  assert.ok(fake.state.activity.every((a) => a.userId === 1 && a.entityType === 'role_permission' && a.entityId === 'lead:REPORT_EXPORT'));
});

test('user override: grant/revoke/default with target role resolved from DB and audited', async () => {
  const fake = createFakeDb();
  const { controller, service } = load(fake);
  await callController(controller.setUser, { params: { userId: '8', code: 'STATISTICS_VIEW' }, body: { allowed: false } });
  assert.equal(fake.state.user.get('8:STATISTICS_VIEW'), 0);
  assert.equal((await service.getEffectivePermissions({ id: 8, role: 'worker' })).has('STATISTICS_VIEW'), false);
  await callController(controller.setUser, { params: { userId: '8', code: 'STATISTICS_VIEW' }, body: { allowed: null } });
  assert.equal(fake.state.user.has('8:STATISTICS_VIEW'), false);
  assert.equal((await service.getEffectivePermissions({ id: 8, role: 'worker' })).has('STATISTICS_VIEW'), true);
  assert.deepEqual(fake.state.activity.map((a) => [a.action, a.entityType, a.metadata.role]), [
    ['PERMISSION_OVERRIDE_REVOKED', 'user_permission', 'worker'],
    ['PERMISSION_OVERRIDE_CLEARED', 'user_permission', 'worker'],
  ]);
});

test('ceilings and invariants are enforced server-side (nothing is written)', async () => {
  const fake = createFakeDb();
  const { controller } = load(fake);
  const cases = [
    [controller.setRole, { role: 'lead', code: 'PERMISSION_MANAGE' }, true, 'PERMISSION_ABOVE_ROLE_CEILING'],
    [controller.setRole, { role: 'admin_ops', code: 'PERMISSION_MANAGE' }, true, 'PERMISSION_ABOVE_ROLE_CEILING'],
    [controller.setRole, { role: 'admin_ops', code: 'MASTER_EDIT' }, true, 'PERMISSION_ABOVE_ROLE_CEILING'],
    [controller.setRole, { role: 'worker', code: 'REPORT_APPROVE' }, true, 'PERMISSION_ABOVE_ROLE_CEILING'],
    [controller.setRole, { role: 'admin', code: 'REPORT_EXPORT' }, false, 'PERMISSION_ADMIN_IMMUTABLE'],
    [controller.setRole, { role: 'manager', code: 'REPORT_APPROVED_EDIT' }, false, 'PERMISSION_MANDATORY'],
    [controller.setRole, { role: 'super_admin', code: 'REPORT_EXPORT' }, true, 'PERMISSION_ADMIN_IMMUTABLE'],
    [controller.setRole, { role: 'root', code: 'REPORT_EXPORT' }, true, 'PERMISSION_ROLE_INVALID'],
    [controller.setRole, { role: 'lead', code: 'NOT_A_CODE' }, true, 'PERMISSION_CODE_INVALID'],
    [controller.setRole, { role: 'lead', code: 'REPORT_EXPORT' }, 'yes', 'PERMISSION_VALUE_INVALID'],
    [controller.setUser, { userId: '1', code: 'REPORT_EXPORT' }, false, 'PERMISSION_ADMIN_IMMUTABLE'],
    [controller.setUser, { userId: '7', code: 'MASTER_EDIT' }, false, 'PERMISSION_MANDATORY'],
    [controller.setUser, { userId: '10', code: 'PERMISSION_MANAGE' }, true, 'PERMISSION_ABOVE_ROLE_CEILING'],
    [controller.setUser, { userId: '404', code: 'REPORT_EXPORT' }, true, 'PERMISSION_USER_NOT_FOUND'],
  ];
  for (const [handler, params, allowed, code] of cases) {
    const r = await callController(handler, { params, body: { allowed } });
    assert.ok(r.status >= 400 && r.status < 500, `${JSON.stringify(params)} -> ${r.status}`);
    assert.equal(r.body.code, code, JSON.stringify(params));
  }
  assert.equal(fake.state.role.size + fake.state.user.size, 0);
  assert.equal(fake.state.activity.length, 0);
});

test('admin_ops ceiling still caps effective permissions even with an existing grant row', async () => {
  const fake = createFakeDb();
  fake.state.role.set('admin_ops:MASTER_EDIT', 1);
  const { service } = load(fake);
  const effective = await service.getEffectivePermissions({ id: 10, role: 'admin_ops' });
  assert.equal(effective.has('MASTER_EDIT'), false);
  assert.equal(await service.hasPermission({ id: 10, role: 'admin_ops' }, 'PERMISSION_MANAGE'), false);
});

test('an audit failure rolls the permission change back (no unaudited change)', async () => {
  const fake = createFakeDb({ failAudit: true });
  const { controller } = load(fake);
  await assert.rejects(() => callController(controller.setRole, { params: { role: 'lead', code: 'REPORT_EXPORT' }, body: { allowed: false } }), /audit down/);
  assert.equal(fake.state.role.size, 0);
  assert.ok(fake.state.log.includes('ROLLBACK'));
  assert.ok(!fake.state.log.includes('COMMIT'));
});
