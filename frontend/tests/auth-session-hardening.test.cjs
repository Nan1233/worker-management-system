const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('cross-tab account switch retires stale tab access state without deleting shared refresh session', () => {
  const storage = read('src/utils/authStorage.ts');
  const api = read('src/services/api.ts');

  assert.match(storage, /export function clearCurrentTabAuthSession\(\): void/);
  assert.match(storage, /sessionStorage\.removeItem\(key\)/);
  assert.doesNotMatch(
    storage.match(/export function clearCurrentTabAuthSession[\s\S]*?\n}\n/)?.[0] || '',
    /localStorage\.removeItem\(REFRESH_SESSION_HINT_KEY\)/
  );

  assert.match(api, /event\.key !== "ktcAuthEpoch"/);
  assert.match(api, /clearCurrentTabAuthSession\(\)/);
  assert.match(api, /ktcCrossTabAuthInvalidated/);
  assert.match(api, /window\.location\.replace/);
});

test('refresh response cannot silently change authenticated user identity', () => {
  const api = read('src/services/api.ts');
  assert.match(api, /const currentUser = getStoredUser\(\)/);
  assert.match(api, /currentUser\.id !== refreshedUser\.id/);
  assert.match(api, /Phiên làm mới thuộc tài khoản khác/);
  assert.match(api, /clearCurrentTabAuthSession\(\)/);
});

test('passive cross-tab redirect does not bump auth epoch back and log out the newly signed-in tab', () => {
  const login = read('src/pages/Login.tsx');
  assert.match(login, /passiveCrossTabRedirect/);
  assert.match(login, /sessionStorage\.removeItem\(CROSS_TAB_LOGIN_MARKER_KEY\)/);
  assert.match(login, /if \(passiveCrossTabRedirect\)[\s\S]*?clearCurrentTabAuthSession\(\)[\s\S]*?else[\s\S]*?beginLoginTransition\(\)/);
});

test('hosted HTTPS Electron refresh uses cookie credentials and does not require or persist a JSON refresh token', () => {
  const api = read('src/services/api.ts');
  const storage = read('src/utils/authStorage.ts');
  const refreshBlock = api.slice(
    api.indexOf('async function performNetworkRefresh()'),
    api.indexOf('export async function refreshAccessToken')
  );

  assert.match(refreshBlock, /refreshToken \? \{ refreshToken \} : \{\}/);
  assert.match(refreshBlock, /withCredentials: true/);
  assert.match(refreshBlock, /if \(supportsElectronRefreshTokenBody\(\)\) \{[\s\S]*?ELECTRON_REFRESH_TOKEN_SUCCESSOR_MISSING/);
  assert.match(storage, /export function supportsElectronRefreshTokenBody\(\): boolean \{[\s\S]*?origin === "null" \|\| origin\.startsWith\("file:"\)/);
  assert.match(storage, /export function setRefreshToken\(token: string\): void \{[\s\S]*?localStorage\.removeItem\(REFRESH_TOKEN_KEY\);[\s\S]*?sessionStorage\.removeItem\(REFRESH_TOKEN_KEY\);/);
});

test('login still isolates the new request from previous account tokens', () => {
  const authService = read('src/services/authService.ts');
  assert.match(authService, /const previousRefreshToken = getPreviousRefreshTokenForLogin\(\)/);
  assert.match(authService, /preservePreviousRefreshTokenForLogin\(\)/);
  assert.match(authService, /supportsElectronRefreshTokenBody\(\)/);
  assert.match(authService, /const loginEpoch = beginLoginTransition\(\)/);
  assert.match(authService, /clearAuthSession\(\{ bumpEpoch: false \}\)/);
  assert.match(authService, /supportsElectronRefreshTokenBody\(\) && previousRefreshToken[\s\S]*?previous_refresh_token: previousRefreshToken/);
  assert.match(authService, /getAuthEpoch\(\) !== loginEpoch/);
  assert.match(authService, /let loginInFlight: Promise<LoginResponse> \| null = null/);
  assert.match(authService, /if \(loginInFlight\)[\s\S]*?new axios\.CanceledError/);
  const loginPage = read('src/pages/Login.tsx');
  const storage = read('src/utils/authStorage.ts');
  assert.match(storage, /export function supportsElectronRefreshTokenBody\(\)/);
  assert.match(storage, /origin === "null" \|\| origin\.startsWith\("file:"\)/);
  const api = read('src/services/api.ts');
  assert.match(api, /if \(supportsElectronRefreshTokenBody\(\)\) \{[\s\S]*?ELECTRON_REFRESH_TOKEN_SUCCESSOR_MISSING/);
  assert.match(storage, /export function getRefreshToken\(\): string \| null \{\s*if \(supportsElectronRefreshTokenBody\(\)\)/);
  assert.match(storage, /export function setRefreshToken\(token: string\): void \{\s*if \(supportsElectronRefreshTokenBody\(\)\)/);
  // Hosted Electron loads HTTPS, so refresh must use the HttpOnly cookie and must not require a JSON successor token.
  assert.match(loginPage, /loginInFlightRef = useRef\(false\)/);
  assert.match(loginPage, /if \(axios\.isCancel\(err\)\) return/);
  assert.ok(
    loginPage.indexOf('preservePreviousRefreshTokenForLogin()') <
      loginPage.indexOf('clearAuthSession({ bumpEpoch: false })'),
    'login page must preserve the Electron token before clearing storage'
  );
});

test('late logout completion cannot clear a newer login session', () => {
  const authService = read('src/services/authService.ts');
  const logoutBlock = authService.slice(
    authService.indexOf('export const logout'),
    authService.indexOf('export interface ChangePasswordInput')
  );

  assert.match(logoutBlock, /clearAuthSession\(\);\s*const logoutEpoch = getAuthEpoch\(\)/);
  assert.match(logoutBlock, /if \(getAuthEpoch\(\) === logoutEpoch\)\s*\{\s*clearAuthSession\(\{ bumpEpoch: false \}\);/);
});

test('late refresh authentication failure cannot clear a newer account session', () => {
  const api = read('src/services/api.ts');
  const refreshBlock = api.slice(
    api.indexOf('export async function refreshAccessToken'),
    api.indexOf('export function isAuthRefreshInProgress')
  );

  assert.match(refreshBlock, /const generationAtStart = authGeneration/);
  assert.match(refreshBlock, /const epochAtStart = getAuthEpoch\(\)/);
  assert.match(refreshBlock, /generationAtStart !== authGeneration[\s\S]*?epochAtStart !== getAuthEpoch\(\)[\s\S]*?loginTransitionActive/);
  assert.match(refreshBlock, /throw new axios\.CanceledError\("Kết quả refresh thuộc phiên đăng nhập cũ đã bị bỏ qua\."\)/);
});

test('stale refresh cleanup cannot detach a newer refresh promise or controller', () => {
  const api = read('src/services/api.ts');
  const networkRefresh = api.slice(
    api.indexOf('async function performNetworkRefresh'),
    api.indexOf('export async function refreshAccessToken')
  );
  const refreshBlock = api.slice(
    api.indexOf('export async function refreshAccessToken'),
    api.indexOf('export function isAuthRefreshInProgress')
  );

  assert.match(networkRefresh, /const requestController = new AbortController\(\)/);
  assert.match(networkRefresh, /if \(refreshAbortController === requestController\)\s*\{\s*refreshAbortController = null/);
  assert.match(refreshBlock, /const pendingRefresh = coordinatedRefresh\(\)\.finally\(\(\) => \{[\s\S]*?if \(refreshPromise === pendingRefresh\)\s*\{\s*refreshPromise = null/);
  assert.doesNotMatch(refreshBlock, /finally \{\s*refreshAbortController = null/);
});


test('stale tab invalidation preserves shared localStorage session owned by the newer tab', () => {
  const assert = require('node:assert/strict');
  const Module = require('node:module');
  const ts = require('typescript');
  const storageSource = read('src/utils/authStorage.ts');

  class MemoryStorage {
    constructor(initial = {}) { this.values = new Map(Object.entries(initial)); }
    getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
    setItem(key, value) { this.values.set(String(key), String(value)); }
    removeItem(key) { this.values.delete(key); }
    clear() { this.values.clear(); }
    key(index) { return [...this.values.keys()][index] ?? null; }
    get length() { return this.values.size; }
  }

  const originalDescriptors = {};
  for (const key of ['localStorage', 'sessionStorage', 'window', 'navigator', 'CustomEvent']) {
    originalDescriptors[key] = Object.getOwnPropertyDescriptor(globalThis, key);
  }
  const local = new MemoryStorage({
    accessToken: 'new-account-access-token',
    token: 'new-account-access-token',
    user: JSON.stringify({ id: 202, username: 'account-B' }),
    ktcAuthSessionId: 'session-B',
    ktcRefreshSessionHint: '1'
  });
  const session = new MemoryStorage({
    accessToken: 'stale-account-access-token',
    token: 'stale-account-access-token',
    user: JSON.stringify({ id: 101, username: 'account-A' })
  });
  const dispatched = [];
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: local });
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: session });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: 'Mozilla/5.0' } });
  Object.defineProperty(globalThis, 'CustomEvent', { configurable: true, value: class CustomEvent { constructor(type) { this.type = type; } } });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { dispatchEvent: (event) => dispatched.push(event.type) } });

  const filename = path.join(root, 'src/utils/authStorage.runtime-test.js');
  const compiled = ts.transpileModule(storageSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
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
    loaded.exports.clearCurrentTabAuthSession();

    assert.equal(local.getItem('accessToken'), 'new-account-access-token');
    assert.equal(local.getItem('user'), JSON.stringify({ id: 202, username: 'account-B' }));
    assert.equal(local.getItem('ktcAuthSessionId'), 'session-B');
    assert.equal(local.getItem('ktcRefreshSessionHint'), '1');
    assert.equal(session.getItem('accessToken'), null);
    assert.equal(session.getItem('user'), null);
    assert.deepEqual(dispatched, ['ktc:tab-auth-cleared']);
  } finally {
    Module._load = originalLoad;
    for (const key of Object.keys(originalDescriptors)) {
      if (originalDescriptors[key]) Object.defineProperty(globalThis, key, originalDescriptors[key]);
      else delete globalThis[key];
    }
  }
});

test('cross-tab invalidated renderer blocks stale protected requests until a fresh login', () => {
  const api = read('src/services/api.ts');
  assert.match(api, /let crossTabAuthInvalidated = false/);
  assert.match(api, /crossTabAuthInvalidated && !requestUrl\.includes\("\/auth\/login"\)/);
  assert.match(api, /authGeneration = getAuthEpoch\(\);\s*crossTabObservedEpoch = authGeneration;\s*crossTabAuthInvalidated = true;/);
  assert.match(api, /loginTransitionActive = true;\s*crossTabAuthInvalidated = false;/);
});


test('request guard checks shared auth epoch before storage event delivery', () => {
  const api = read('src/services/api.ts');
  assert.match(api, /let crossTabObservedEpoch = getAuthEpoch\(\)/);
  assert.match(api, /const currentEpoch = getAuthEpoch\(\)/);
  assert.match(api, /currentEpoch !== crossTabObservedEpoch && !requestUrl\.includes\("\/auth\/login"\)/);
  assert.match(api, /crossTabObservedEpoch = authGeneration/);
});
