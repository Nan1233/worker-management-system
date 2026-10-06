const test = require('node:test');
const assert = require('node:assert/strict');

const permissionService = require('../services/permissionService');
const db = require('../config/db');

test.after(async () => {
  if (typeof db.closePool === 'function') await db.closePool();
});

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
  manager: {
    allow: ['DASHBOARD_VIEW','REPORT_PENDING_VIEW','REPORT_APPROVE','REPORT_PENDING_EDIT','REPORT_APPROVED_VIEW','REPORT_APPROVED_EDIT','REPORT_DELETE','REPORT_EXPORT','EXCEL_DB_SYNC','EXCEL_MASTER_SYNC','USER_VIEW','USER_CREATE','USER_EDIT','MASTER_VIEW','MASTER_EDIT','GOVERNANCE_VIEW','AUDIT_VIEW','NOTIFICATION_VIEW','STATISTICS_VIEW','PROFILE_VIEW'],
    deny: ['PERMISSION_MANAGE','WORKER_ENTRY','WORKER_HISTORY']
  },
  admin: {
    allow: permissionService.getPermissionList().map((item) => item.code),
    deny: []
  }
};

test('permission matrix is complete for Worker/Lead/Manager/Admin', async () => {
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
