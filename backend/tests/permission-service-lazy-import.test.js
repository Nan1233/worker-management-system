'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

test('loading permission catalog and checking super-admin does not bootstrap a database pool', async () => {
  const dbPath = require.resolve('../config/db');
  const permissionPath = require.resolve('../services/permissionService');
  // This file runs in its own Node test worker, without a DB fixture.
  assert.equal(require.cache[dbPath], undefined, 'test must start without a DB pool');
  const permissionService = require(permissionPath);
  assert.equal(require.cache[dbPath], undefined, 'reading the permission catalog should not open TiDB connections');
  const all = permissionService.getPermissionList().map((p) => p.code).sort();
  const actual = [...await permissionService.getEffectivePermissions({ id: 240002, role: 'super_admin' })].sort();
  assert.deepEqual(actual, all);
  assert.equal(await permissionService.hasPermission({ id: 240002, role: 'super_admin' }, 'PERMISSION_MANAGE'), true);
  assert.equal(require.cache[dbPath], undefined, 'a super-admin permission check must not require the database');
});
