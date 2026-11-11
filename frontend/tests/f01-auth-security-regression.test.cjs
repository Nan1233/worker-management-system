'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const frontendRoot = path.resolve(__dirname, '..');
const repositoryRoot = path.resolve(frontendRoot, '..');
const read = (file) => fs.readFileSync(path.join(repositoryRoot, file), 'utf8');

class MemoryStorage {
  constructor(values = {}) {
    this.values = new Map(Object.entries(values));
  }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

function withAuthStorage(userAgent, callback) {
  const globals = ['localStorage', 'sessionStorage', 'window', 'navigator', 'CustomEvent'];
  const previous = Object.fromEntries(globals.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const local = new MemoryStorage({ accessToken: 'legacy-persistent-token', token: 'legacy-persistent-token' });
  const session = new MemoryStorage();
  const installed = {
    localStorage: local,
    sessionStorage: session,
    navigator: { userAgent },
    window: { location: { origin: userAgent.includes('Electron') ? 'null' : 'https://example.test' }, dispatchEvent() {} },
    CustomEvent: class CustomEvent { constructor(type) { this.type = type; } }
  };
  for (const [key, value] of Object.entries(installed)) {
    Object.defineProperty(globalThis, key, { configurable: true, value });
  }

  const filename = path.join(frontendRoot, 'src/utils/__f01-storage-test.cjs');
  const compiled = ts.transpileModule(
    read('frontend/src/utils/authStorage.ts'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }
  ).outputText;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalLoad = Module._load;
  try {
    Module._load = function(request, parent, isMain) {
      if (parent && parent.filename === filename && request === '../services/sessionCache') {
        return { clearSessionCache() {}, setSessionCacheScope() {} };
      }
      return originalLoad.call(this, request, parent, isMain);
    };
    loaded._compile(compiled, filename);
    return callback({ auth: loaded.exports, local, session });
  } finally {
    Module._load = originalLoad;
    for (const key of globals) {
      if (previous[key]) Object.defineProperty(globalThis, key, previous[key]);
      else delete globalThis[key];
    }
  }
}

test('web access token is session-scoped and old persistent access tokens are retired', () => {
  withAuthStorage('Mozilla/5.0', ({ auth, local, session }) => {
    assert.equal(auth.getAccessToken(), null);
    assert.equal(local.getItem('accessToken'), null);
    auth.setAccessToken('new-web-token');
    assert.equal(session.getItem('accessToken'), 'new-web-token');
    assert.equal(local.getItem('accessToken'), null);
    assert.equal(auth.getAccessToken(), 'new-web-token');
    auth.setStoredUser({ id: 49, username: 'w49', full_name: 'Worker', role: 'worker' });
    assert.equal(local.getItem('user'), null);
    assert.ok(session.getItem('user'));
  });
});

test('Electron keeps native persistent token compatibility', () => {
  withAuthStorage('Electron/40.0', ({ auth, local }) => {
    auth.setAccessToken('native-token');
    assert.equal(local.getItem('accessToken'), 'native-token');
    assert.equal(auth.getAccessToken(), 'native-token');
  });
});

test('permission fetch failure does not grant role default capabilities', () => {
  const source = read('frontend/src/security/permissions.ts');
  assert.match(source, /catch\s*\{\s*return new Set<PermissionCode>\(\);\s*\}/);
  assert.doesNotMatch(source, /catch\s*\{\s*return defaultPermissionsForRole\(/);
  const guard = read('frontend/src/routes/PermissionRoute.tsx');
  assert.match(guard, /allowed:\s*null/);
  assert.match(guard, /Không thể xác minh quyền truy cập/);
  assert.match(guard, /state\.fallback === location\.pathname/);
});

test('manager default permissions include backend health capability', () => {
  const frontend = read('frontend/src/security/permissions.ts');
  const backend = read('backend/services/permissionService.js');
  assert.match(frontend, /manager:\s*\[[^\]]*SYSTEM_HEALTH_VIEW/);
  assert.match(backend, /manager:\s*\[[^\]]*SYSTEM_HEALTH_VIEW/);
});

test('login retains safe same-role redirect without allowing external URLs', () => {
  const login = read('frontend/src/pages/Login.tsx');
  assert.doesNotMatch(login, /sessionStorage\.removeItem\("redirectAfterLogin"\);[\s\S]*?if \(\/\\\/login/);
  assert.match(login, /redirectAfterLogin\.startsWith\("\/"\)/);
  assert.match(login, /!redirectAfterLogin\.startsWith\("\/\/"\)/);
  assert.match(login, /redirectAfterLogin\.startsWith\(roleHome \+ "\/"\)/);
});
