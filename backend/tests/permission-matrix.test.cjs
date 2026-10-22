const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../config/db');
const realDbPromise = db.promise;

function useDefaultOnlySchemaMock() {
  db.promise = () => ({
    query: async (sql) => {
      if (/information_schema\.tables/i.test(sql)) return [[{ total: 0 }], []];
      throw new Error(`Unexpected database query in default-only permission matrix test: ${sql}`);
    }
  });
}

useDefaultOnlySchemaMock();
const permissionService = require('../services/permissionService');

test.after(async () => {
  db.promise = realDbPromise;
  if (typeof db.closePool === 'function') await db.closePool();
});

async function withPermissionDb(query, run) {
  const servicePath = require.resolve('../services/permissionService');
  const previousPromise = db.promise;
  db.promise = () => ({ query });
  delete require.cache[servicePath];
  const service = require('../services/permissionService');
  try {
    await run(service);
  } finally {
    delete require.cache[servicePath];
    db.promise = previousPromise;
  }
}

function testMatrixForRole(role) { return permissionService.getEffectivePermissions({ id: 900000 + role.length, role }); }

const matrix = {
  worker: {
    allow: ['NOTIFICATION_VIEW','WORKER_ENTRY','WORKER_HISTORY','STATISTICS_VIEW','PROFILE_VIEW'],
    deny: ['REPORT_APPROVE','REPORT_PENDING_EDIT','REPORT_APPROVED_EDIT','REPORT_DELETE','REPORT_EXPORT','EXCEL_DB_SYNC','EXCEL_MASTER_SYNC','USER_VIEW','USER_CREATE','USER_EDIT','MASTER_VIEW','MASTER_EDIT','GOVERNANCE_VIEW','AUDIT_VIEW','SYSTEM_HEALTH_VIEW','PERMISSION_MANAGE']
  },
  lead: {
    allow: ['DASHBOARD_VIEW','REPORT_PENDING_VIEW','REPORT_APPROVE','REPORT_PENDING_EDIT','REPORT_APPROVED_VIEW','REPORT_APPROVED_EDIT','REPORT_EXPORT','USER_VIEW','MASTER_VIEW','MASTER_EDIT','AUDIT_VIEW','NOTIFICATION_VIEW','STATISTICS_VIEW','PROFILE_VIEW'],
    deny: ['REPORT_DELETE','EXCEL_DB_SYNC','EXCEL_MASTER_SYNC','USER_CREATE','USER_EDIT','GOVERNANCE_VIEW','SYSTEM_HEALTH_VIEW','PERMISSION_MANAGE','WORKER_ENTRY','WORKER_HISTORY']
  },
  admin_ops: {
    allow: ['DASHBOARD_VIEW','REPORT_PENDING_VIEW','REPORT_APPROVE','REPORT_APPROVED_VIEW','REPORT_APPROVED_EDIT','REPORT_EXPORT','USER_VIEW','USER_CREATE','USER_EDIT','MASTER_VIEW','STATISTICS_VIEW','NOTIFICATION_VIEW','AUDIT_VIEW','PROFILE_VIEW'],
    deny: ['REPORT_PENDING_EDIT','REPORT_DELETE','EXCEL_DB_SYNC','EXCEL_MASTER_SYNC','MASTER_EDIT','GOVERNANCE_VIEW','SYSTEM_HEALTH_VIEW','PERMISSION_MANAGE','WORKER_ENTRY','WORKER_HISTORY']
  },
  manager: {
    allow: ['DASHBOARD_VIEW','REPORT_PENDING_VIEW','REPORT_APPROVE','REPORT_PENDING_EDIT','REPORT_APPROVED_VIEW','REPORT_APPROVED_EDIT','REPORT_DELETE','REPORT_EXPORT','EXCEL_DB_SYNC','EXCEL_MASTER_SYNC','USER_VIEW','USER_CREATE','USER_EDIT','MASTER_VIEW','MASTER_EDIT','GOVERNANCE_VIEW','AUDIT_VIEW','NOTIFICATION_VIEW','STATISTICS_VIEW','PROFILE_VIEW'],
    deny: ['PERMISSION_MANAGE','WORKER_ENTRY','WORKER_HISTORY']
  },
  admin: {
    allow: permissionService.getPermissionList().map((item) => item.code),
    deny: []
  }
};

test('permission matrix is complete for Worker/Lead/AdminOps/Manager/Admin', async () => {
  for (const [role, expected] of Object.entries(matrix)) {
    const permissions = await permissionService.getEffectivePermissions({ id: 900000 + Object.keys(matrix).indexOf(role), role });
    for (const code of expected.allow) assert.equal(permissions.has(code), true, `${role} must allow ${code}`);
    for (const code of expected.deny) assert.equal(permissions.has(code), false, `${role} must deny ${code}`);
  }
});

test('role inheritance is monotonic for management capabilities and excludes worker context', async () => {
  const worker = await permissionService.getEffectivePermissions({ id: 910001, role: 'worker' });
  const lead = await permissionService.getEffectivePermissions({ id: 910002, role: 'lead' });
  const manager = await permissionService.getEffectivePermissions({ id: 910003, role: 'manager' });
  const admin = await permissionService.getEffectivePermissions({ id: 910004, role: 'admin' });

  for (const code of worker) {
    if (!['WORKER_ENTRY','WORKER_HISTORY'].includes(code)) assert.equal(lead.has(code), true, `Lead must inherit ${code}`);
  }
  for (const code of lead) assert.equal(manager.has(code), true, `Manager must inherit ${code}`);
  for (const code of manager) assert.equal(admin.has(code), true, `Admin must inherit ${code}`);

  assert.equal(lead.has('WORKER_ENTRY'), false);
  assert.equal(lead.has('WORKER_HISTORY'), false);
  assert.equal(manager.has('WORKER_ENTRY'), false);
  assert.equal(manager.has('WORKER_HISTORY'), false);
});

test('mandatory security/business permissions cannot be disabled by overrides', async () => {
  for (const role of ['lead','manager']) {
    const mandatory = role === 'lead'
      ? ['MASTER_VIEW','MASTER_EDIT','REPORT_PENDING_EDIT','REPORT_APPROVED_EDIT']
      : ['REPORT_APPROVED_EDIT'];
    const permissions = await permissionService.getEffectivePermissions({ id: 920000 + role.length, role });
    for (const code of mandatory) assert.equal(permissions.has(code), true, `${role} must retain ${code}`);
  }
});

test('system health stays management-level, not inherited by Lead', async () => {
  const lead = await permissionService.getEffectivePermissions({ id: 930001, role: 'lead' });
  const manager = await permissionService.getEffectivePermissions({ id: 930002, role: 'manager' });
  const admin = await permissionService.getEffectivePermissions({ id: 930003, role: 'admin' });
  assert.equal(lead.has('SYSTEM_HEALTH_VIEW'), false);
  assert.equal(manager.has('SYSTEM_HEALTH_VIEW'), true);
  assert.equal(admin.has('SYSTEM_HEALTH_VIEW'), true);
});


test('missing permission override tables use role defaults only when metadata query succeeds', async () => {
  await withPermissionDb(async (sql) => {
    assert.match(sql, /information_schema\.tables/i);
    return [[{ total: 0 }], []];
  }, async (service) => {
    const permissions = await service.getEffectivePermissions({ id: 940001, role: 'worker' });
    assert.equal(permissions.has('WORKER_ENTRY'), true);
    assert.equal(permissions.has('REPORT_APPROVE'), false);
  });
});

test('permission overrides are applied when both override tables exist', async () => {
  await withPermissionDb(async (sql) => {
    if (/information_schema\.tables/i.test(sql)) return [[{ total: 2 }], []];
    if (/FROM role_permission_overrides/i.test(sql)) {
      return [[{ permission_code: 'REPORT_APPROVE', allowed: 0 }], []];
    }
    if (/FROM user_permission_overrides/i.test(sql)) return [[], []];
    throw new Error(`Unexpected query: ${sql}`);
  }, async (service) => {
    const permissions = await service.getEffectivePermissions({ id: 940002, role: 'lead' });
    assert.equal(permissions.has('REPORT_APPROVE'), false, 'explicit role deny must override the default');
  });
});

test('permission schema lookup errors propagate and do not poison schema cache', async () => {
  const timeout = Object.assign(new Error('simulated database timeout'), { code: 'ETIMEDOUT' });
  let schemaLookups = 0;
  await withPermissionDb(async (sql) => {
    assert.match(sql, /information_schema\.tables/i);
    schemaLookups += 1;
    if (schemaLookups === 1) throw timeout;
    return [[{ total: 0 }], []];
  }, async (service) => {
    await assert.rejects(
      service.getEffectivePermissions({ id: 940003, role: 'lead' }),
      (error) => error === timeout
    );
    const recovered = await service.getEffectivePermissions({ id: 940003, role: 'lead' });
    assert.equal(recovered.has('REPORT_APPROVE'), true);
    assert.equal(schemaLookups, 2, 'a transient failure must be retried, not cached as missing schema');
  });
});

test('permission schema privilege and SQL errors do not silently fall back to role defaults', async () => {
  const failures = [
    Object.assign(new Error('simulated information_schema access denied'), { code: 'ER_TABLEACCESS_DENIED_ERROR' }),
    Object.assign(new Error('simulated schema query syntax error'), { code: 'ER_PARSE_ERROR' }),
    Object.assign(new Error('simulated connection reset'), { code: 'ECONNRESET' })
  ];
  for (const failure of failures) {
    await withPermissionDb(async (sql) => {
      assert.match(sql, /information_schema\.tables/i);
      throw failure;
    }, async (service) => {
      await assert.rejects(
        service.getEffectivePermissions({ id: 940004, role: 'manager' }),
        (error) => error === failure
      );
    });
  }
});
