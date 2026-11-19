'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/security/permissions.ts'), 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function harness() {
  const requests = [];
  const user = { id: 49, role: 'manager' };
  const exports = {};
  const module = { exports };
  vm.runInNewContext(js, {
    module, exports,
    require(specifier) {
      if (specifier === '../services/api') return { default: {
        get: (endpoint) => {
          assert.equal(endpoint, '/permissions/me');
          return new Promise((resolve, reject) => requests.push({ resolve, reject }));
        },
      } };
      if (specifier === '../utils/authStorage') return { getStoredUser: () => user };
      throw new Error('Unexpected dependency: ' + specifier);
    },
    Date, Set, Number, String,
  }, { filename: 'permissions.js' });
  return { api: module.exports, requests, user };
}

test('clearing permissions invalidates an in-flight old response and allows an immediate fresh request', async () => {
  const { api, requests } = harness();
  const old = api.loadMyPermissions();
  assert.equal(requests.length, 1);
  api.clearPermissionClientCache();
  const fresh = api.loadMyPermissions();
  assert.equal(requests.length, 2, 'must not reuse the invalidated in-flight request');

  requests[1].resolve({ data: { data: { permissions: ['REPORT_APPROVED_VIEW'] } } });
  assert.equal((await fresh).has('REPORT_APPROVED_VIEW'), true);

  requests[0].resolve({ data: { data: { permissions: ['PERMISSION_MANAGE'] } } });
  const stale = await old;
  assert.equal(stale.size, 0, 'invalidated response must fail closed');

  const cached = await api.loadMyPermissions();
  assert.equal(cached.has('PERMISSION_MANAGE'), false);
  assert.equal(cached.has('REPORT_APPROVED_VIEW'), true);
  assert.equal(requests.length, 2, 'fresh rights should stay cached');
});

test('in-flight callers share the same permission request before invalidation', async () => {
  const { api, requests } = harness();
  const a = api.loadMyPermissions();
  const b = api.loadMyPermissions();
  assert.equal(requests.length, 1);
  requests[0].resolve({ data: { data: { permissions: ['REPORT_PENDING_VIEW'] } } });
  assert.equal((await a).has('REPORT_PENDING_VIEW'), true);
  assert.equal((await b).has('REPORT_PENDING_VIEW'), true);
});

test('permission failures fail closed and a forced retry requests again', async () => {
  const { api, requests } = harness();
  const current = api.loadMyPermissions();
  requests[0].reject(new Error('offline'));
  assert.equal((await current).size, 0);
  const retried = api.loadMyPermissions(true);
  assert.equal(requests.length, 2);
  requests[1].resolve({ data: { data: { permissions: ['PROFILE_VIEW'] } } });
  assert.equal((await retried).has('PROFILE_VIEW'), true);
});

test('admin permissions page invalidates cache after role/user update; backend keeps master-control guard', () => {
  const admin = fs.readFileSync(path.join(__dirname, '../src/pages/admin/Permissions.tsx'), 'utf8');
  assert.match(admin, /clearPermissionClientCache\(\)/);
  const backend = fs.readFileSync(path.join(__dirname, '../../backend/routes/adminControlRoutes.js'), 'utf8');
  assert.match(backend, /router\.use\(auth, role\('admin'\)\)/);
  assert.match(backend, /req\.user\?\.is_super_admin === true/);
  assert.match(backend, /SUPER_ADMIN_REQUIRED/);
});

test('permission route retains fail-closed, retry and denied-state handling', () => {
  const route = fs.readFileSync(path.join(__dirname, '../src/routes/PermissionRoute.tsx'), 'utf8');
  assert.match(route, /loadMyPermissions\(retryCount > 0\)/);
  assert.match(route, /if \(!state\.verified\)/);
  assert.match(route, /state\.allowed === null/);
  assert.match(route, /state\.fallback === location\.pathname/);
});
