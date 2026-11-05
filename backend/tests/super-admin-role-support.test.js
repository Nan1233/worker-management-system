'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const backend = path.join(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(backend, relative), 'utf8');

test('super_admin is presented to clients as admin with a DB-derived flag', () => {
  const roles = require('../utils/roles');
  assert.equal(roles.effectiveRole('super_admin'), 'admin');
  assert.equal(roles.effectiveRole('admin'), 'admin');
  assert.deepEqual(roles.publicRoleFields('super_admin'), { role: 'admin', is_super_admin: true });
  assert.deepEqual(roles.publicRoleFields('admin'), { role: 'admin', is_super_admin: false });
});

test('super_admin receives all admin permissions', async () => {
  const permissions = require('../services/permissionService');
  const allCodes = permissions.getPermissionList().map((item) => item.code).sort();
  const effective = [...await permissions.getEffectivePermissions({ id: 240002, role: 'super_admin' })].sort();
  assert.deepEqual(effective, allCodes);
  assert.equal(await permissions.hasPermission({ id: 240002, role: 'super_admin' }, 'PERMISSION_MANAGE'), true);
});

test('only a DB-authenticated super admin may manage admin and super_admin accounts', async () => {
  const { assertUserManagementScope } = require('../services/processAuthorizationService');
  const regularAdmin = { id: 60002, role: 'admin', is_super_admin: false };
  const superAdmin = { id: 240002, role: 'admin', is_super_admin: true };

  await assert.rejects(() => assertUserManagementScope(regularAdmin, { id: 60003, role: 'admin' }), /Vai trò tài khoản nằm ngoài phạm vi quản lý/);
  await assert.rejects(() => assertUserManagementScope(regularAdmin, { id: 240002, role: 'super_admin' }), /Vai trò tài khoản nằm ngoài phạm vi quản lý/);
  assert.equal(await assertUserManagementScope(superAdmin, { id: 60002, role: 'admin' }), true);
  assert.equal(await assertUserManagementScope(superAdmin, { id: 240002, role: 'super_admin' }), true);
  assert.equal(await assertUserManagementScope(regularAdmin, { id: 9, role: 'worker' }), true);
});

test('management login accepts super_admin and returns the canonical public role', () => {
  const auth = read('controllers/authController.js');
  assert.match(auth, /\["super_admin", "admin", "admin_ops", "manager", "lead"\]/);
  assert.equal((auth.match(/\.\.\.publicRoleFields\(/g) || []).length, 3);
});

test('privileged account routes enforce the server-side target guard', () => {
  const users = read('routes/userRoutes.js');
  const permissions = read('routes/permissionRoutes.js');
  assert.match(users, /router\.put\('\/:id', permission\('USER_EDIT'\), guardPrivilegedTarget\(\)/);
  assert.match(users, /router\.post\('\/:id\/promote-lead', guardPrivilegedTarget\(\)/);
  assert.match(users, /router\.post\('\/:id\/promote-manager', guardPrivilegedTarget\(\)/);
  assert.match(users, /router\.delete\('\/:id\/permanent', guardPrivilegedTarget\(\)/);
  assert.match(permissions, /guardPrivilegedTarget\(\(req\)=>req\.params\.userId\)/);
});
