const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('cross-tab account switch retires stale tab access state without deleting shared refresh session', () => {
  const storage = read('frontend/src/utils/authStorage.ts');
  const api = read('frontend/src/services/api.ts');

  assert.match(storage, /export function clearCurrentTabAuthSession\(\): void/);
  assert.match(storage, /sessionStorage\.removeItem\(key\)/);
  assert.match(storage, /Never remove refresh\/session-hint/);
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
  const api = read('frontend/src/services/api.ts');
  assert.match(api, /const currentUser = getStoredUser\(\)/);
  assert.match(api, /currentUser\.id !== refreshedUser\.id/);
  assert.match(api, /Phiên làm mới thuộc tài khoản khác/);
  assert.match(api, /clearCurrentTabAuthSession\(\)/);
});

test('passive cross-tab redirect does not bump auth epoch back and log out the newly signed-in tab', () => {
  const login = read('frontend/src/pages/Login.tsx');
  assert.match(login, /passiveCrossTabRedirect/);
  assert.match(login, /sessionStorage\.removeItem\(CROSS_TAB_LOGIN_MARKER_KEY\)/);
  assert.match(login, /if \(passiveCrossTabRedirect\)[\s\S]*?clearCurrentTabAuthSession\(\)[\s\S]*?else[\s\S]*?beginLoginTransition\(\)/);
});

test('login still isolates the new request from previous account tokens', () => {
  const authService = read('frontend/src/services/authService.ts');
  assert.match(authService, /const previousRefreshToken = getPreviousRefreshTokenForLogin\(\)/);
  assert.match(authService, /preservePreviousRefreshTokenForLogin\(\)/);
  assert.match(authService, /supportsElectronRefreshTokenBody\(\)/);
  assert.match(authService, /const loginEpoch = beginLoginTransition\(\)/);
  assert.match(authService, /clearAuthSession\(\{ bumpEpoch: false \}\)/);
  assert.match(authService, /supportsElectronRefreshTokenBody\(\) && previousRefreshToken[\s\S]*?previous_refresh_token: previousRefreshToken/);
  assert.match(authService, /getAuthEpoch\(\) !== loginEpoch/);
  assert.match(authService, /let loginInFlight: Promise<LoginResponse> \| null = null/);
  assert.match(authService, /if \(loginInFlight\)[\s\S]*?new axios\.CanceledError/);
  const loginPage = read('frontend/src/pages/Login.tsx');
  const storage = read('frontend/src/utils/authStorage.ts');
  assert.match(storage, /export function supportsElectronRefreshTokenBody\(\)/);
  assert.match(storage, /origin === "null" \|\| origin\.startsWith\("file:"\)/);
  assert.match(loginPage, /loginInFlightRef = useRef\(false\)/);
  assert.match(loginPage, /if \(axios\.isCancel\(err\)\) return/);
  assert.ok(
    loginPage.indexOf('preservePreviousRefreshTokenForLogin()') <
      loginPage.indexOf('clearAuthSession({ bumpEpoch: false })'),
    'login page must preserve the Electron token before clearing storage'
  );
});
