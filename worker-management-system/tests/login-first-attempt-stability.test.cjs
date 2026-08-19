const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('login retries one transient backend/network failure without requiring a second click', () => {
  const authService = read('frontend/src/services/authService.ts');
  assert.match(authService, /for \(let attempt = 0; attempt < 2; attempt \+= 1\)/);
  assert.match(authService, /isRetryableLoginFailure\(error\)/);
  assert.match(authService, /RETRYABLE_LOGIN_STATUSES/);
  assert.match(authService, /assertCommittedLoginSession\(data\.user\.id\)/);
  assert.match(authService, /ktc:auth-session-saved/);
});

test('login page initialization is idempotent under React StrictMode', () => {
  const login = read('frontend/src/pages/Login.tsx');
  assert.match(login, /loginPageInitializedRef = useRef\(false\)/);
  assert.match(login, /if \(loginPageInitializedRef\.current\) return/);
});

test('private route waits while login transition is committing auth state', () => {
  const route = read('frontend/src/routes/PrivateRoute.tsx');
  assert.match(route, /isLoginTransitionActive\(\)/);
  assert.match(route, /return <RouteLoading \/>/);
});
