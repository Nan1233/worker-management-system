const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const api = () => read('frontend/src/services/api.ts');
const coordinator = () => read('frontend/src/services/authRefreshCoordinator.ts');
const storage = () => read('frontend/src/utils/authStorage.ts');
const authService = () => read('frontend/src/services/authService.ts');
const bootstrap = () => read('frontend/src/components/AuthBootstrap.tsx');
const desktop = () => fs.readFileSync(path.join(root, 'desktop', 'electron', 'main.cjs'), 'utf8');

// Same-tab / retry contracts.
test('F11 FE 01 same-tab refresh keeps one shared refreshPromise', () => {
  assert.match(api(), /if \(refreshPromise\)[\s\S]*?return refreshPromise/);
});
test('F11 FE 02 refreshPromise wraps coordinated refresh for all same-tab waiters', () => {
  assert.match(api(), /refreshPromise = coordinatedRefresh\(\)/);
});
test('F11 FE 03 response interceptor retries original request only once', () => {
  const source = api();
  assert.match(source, /originalRequest\._retry/);
  assert.match(source, /originalRequest\._retry = true/);
});
test('F11 FE 04 auth endpoints stay excluded from auto-refresh', () => {
  const source = api();
  assert.match(source, /requestUrl\.includes\("\/auth\/login"\)/);
  assert.match(source, /requestUrl\.includes\("\/auth\/refresh"\)/);
  assert.match(source, /requestUrl\.includes\("\/auth\/logout"\)/);
});
test('F11 FE 05 a second 401 after retry cannot start another refresh loop', () => {
  assert.match(api(), /status !== 401 \|\|[\s\S]*?originalRequest\._retry/);
});

// Cross-tab coordination.
test('F11 FE 06 browser refresh uses a dedicated cross-tab coordinator', () => {
  assert.match(api(), /coordinateBrowserRefresh\(performNetworkRefresh, classifyRefreshFailure\)/);
});
test('F11 FE 07 coordinator has ephemeral tab identity', () => {
  const source = coordinator();
  assert.match(source, /TAB_ID_KEY/);
  assert.match(source, /sessionStorage\.setItem\(TAB_ID_KEY/);
});
test('F11 FE 08 tab identity prefers cryptographic browser primitives', () => {
  const source = coordinator();
  assert.match(source, /crypto\.randomUUID/);
  assert.match(source, /crypto\.getRandomValues/);
});
test('F11 FE 09 coordinator uses bounded refresh lease', () => {
  const source = coordinator();
  assert.match(source, /LOCK_TTL_MS = 8_000/);
  assert.match(source, /expiresAt/);
});
test('F11 FE 10 active leader renews lease heartbeat', () => {
  const source = coordinator();
  assert.match(source, /LOCK_HEARTBEAT_MS = 2_000/);
  assert.match(source, /startHeartbeat/);
});
test('F11 FE 11 lock acquisition verifies ownership after write', () => {
  const source = coordinator();
  assert.match(source, /writeLease\(candidate\)/);
  assert.match(source, /await delay\(LOCK_SETTLE_MS\)/);
  assert.match(source, /sameLease\(verified, candidate\)/);
});
test('F11 FE 12 crashed leader can be replaced after lease expiry', () => {
  const source = coordinator();
  assert.match(source, /existing\.expiresAt > now/);
  assert.match(source, /current\.expiresAt <= Date\.now\(\)/);
});
test('F11 FE 13 leader releases lease in finally', () => {
  assert.match(coordinator(), /finally \{[\s\S]*?removeLeaseIfOwned\(lease\)/);
});
test('F11 FE 14 leader success broadcasts refresh result', () => {
  assert.match(coordinator(), /type: "AUTH_REFRESH_SUCCESS"/);
});
test('F11 FE 15 definitive leader failure broadcasts auth failure', () => {
  assert.match(coordinator(), /type: "AUTH_REFRESH_FAILED"/);
});
test('F11 FE 16 BroadcastChannel is primary result bus', () => {
  const source = coordinator();
  assert.match(source, /new BroadcastChannel\(CHANNEL_NAME\)/);
  assert.match(source, /channel\.postMessage\(signal\)/);
});
test('F11 FE 17 storage event is fallback result bus', () => {
  const source = coordinator();
  assert.match(source, /window\.addEventListener\("storage", onStorage\)/);
  assert.match(source, /localStorage\.setItem\(SIGNAL_KEY/);
});
test('F11 FE 18 storage fallback strips access token from persistent signal', () => {
  assert.match(coordinator(), /\{ \.\.\.signal, accessToken: undefined \}/);
});
test('F11 FE 19 no refresh token is part of coordination signal contract', () => {
  const source = coordinator();
  const signalBlock = source.match(/type RefreshSignal =[\s\S]*?interface RefreshLease/)?.[0] || '';
  assert.doesNotMatch(signalBlock, /refreshToken/);
});
test('F11 FE 20 waiters consume leader BroadcastChannel access token without own concurrent refresh', () => {
  const source = coordinator();
  assert.match(source, /signal\?\.type === "AUTH_REFRESH_SUCCESS" && signal\.accessToken/);
  assert.match(source, /accessToken: signal\.accessToken/);
});
test('F11 FE 21 old-browser storage fallback prefers sequential safe rotation', () => {
  assert.match(coordinator(), /next[\s\S]*?sequential rotation[\s\S]*?HttpOnly/);
});

// Auth state / bootstrap.
test('F11 FE 22 definitive rotation failures include reuse/relogin/disabled codes', () => {
  const source = api();
  for (const code of ['REFRESH_TOKEN_REUSE_DETECTED','REFRESH_TOKEN_RELOGIN_REQUIRED','SESSION_USER_DISABLED','REFRESH_TOKEN_EXPIRED','REFRESH_TOKEN_REVOKED']) {
    assert.match(source, new RegExp(code));
  }
});
test('F11 FE 23 definitive auth failure clears shared auth session', () => {
  assert.match(api(), /isConfirmedInvalidRefresh\(error\)[\s\S]*?invalidateSessionAndRedirect\(\)/);
});
test('F11 FE 24 transient failure preserves cooldown instead of permanent logout', () => {
  const source = api();
  assert.match(source, /transientRefreshBlockedUntil =/);
  assert.match(source, /TRANSIENT_REFRESH_COOLDOWN_MS/);
});
test('F11 FE 25 auth epoch remains identity-change channel', () => {
  const source = api();
  assert.match(source, /event\.key !== "ktcAuthEpoch"/);
  assert.match(source, /clearCurrentTabAuthSession\(\)/);
});
test('F11 FE 26 logout bumps auth epoch through clearAuthSession', () => {
  assert.match(authService(), /finally \{[\s\S]*?clearAuthSession\(\)/);
});
test('F11 FE 27 bootstrap reuses initializeAuthSession and common refresh path', () => {
  assert.match(bootstrap(), /initializeAuthSession\(\)/);
  assert.match(api(), /initializeAuthSession[\s\S]*?refreshAccessToken\(true\)/);
});
test('F11 FE 28 reconnect also reuses coordinated refresh path', () => {
  assert.match(api(), /scheduleConnectionRestore[\s\S]*?refreshAccessToken\(true\)/);
});

// Electron rotation persistence.
test('F11 FE 29 Electron refresh requires successor token response', () => {
  const source = api();
  assert.match(source, /isElectronRuntime\(\)/);
  assert.match(source, /ELECTRON_REFRESH_TOKEN_SUCCESSOR_MISSING/);
});
test('F11 FE 30 Electron stores successor before returning access result', () => {
  const source = api();
  const persist = source.indexOf('setRefreshToken(response.data.refreshToken)');
  const result = source.indexOf('return {\n            accessToken: newAccessToken');
  assert.ok(persist >= 0 && result > persist);
});
test('F11 FE 31 Electron storage failure fails closed', () => {
  const source = api();
  assert.match(source, /ELECTRON_REFRESH_TOKEN_PERSIST_FAILED/);
  assert.match(source, /clearAuthSession\(\);[\s\S]*?redirectToLogin\(\)/);
});
test('F11 FE 32 Electron refresh token storage replaces one current key only', () => {
  const source = storage();
  assert.match(source, /localStorage\.setItem\(REFRESH_TOKEN_KEY, token\)/);
  assert.doesNotMatch(source, /refreshTokenHistory|previousRefreshTokens|refreshTokenChain/);
});
test('F11 FE 33 Electron next refresh reads current persisted successor', () => {
  const source = api();
  assert.match(source, /const refreshToken = getRefreshToken\(\)/);
  assert.match(source, /refreshToken \? \{ refreshToken \} : \{\}/);
});
test('F11 FE 34 Electron logout sends current token and clears it locally', () => {
  const source = authService();
  assert.match(source, /const refreshToken =[\s\S]*?getRefreshToken\(\)/);
  assert.match(source, /finally \{[\s\S]*?clearAuthSession\(\)/);
});
test('F11 FE 35 desktop currently creates one renderer BrowserWindow', () => {
  const source = desktop();
  const matches = source.match(/new BrowserWindow\(/g) || [];
  assert.equal(matches.length, 1);
});

// Static security boundaries.
test('F11 FE 36 normal web setRefreshToken removes JS-readable refresh token', () => {
  const source = storage();
  assert.match(source, /Web uses an HttpOnly cookie and never exposes the refresh token to JS/);
  assert.match(source, /return null;/);
  assert.match(source, /localStorage\.removeItem\(REFRESH_TOKEN_KEY\)/);
  assert.match(source, /sessionStorage\.removeItem\(REFRESH_TOKEN_KEY\)/);
});
test('F11 FE 37 logout does not log Axios error object that may contain refresh body', () => {
  const source = authService();
  assert.doesNotMatch(source, /console\.error\([\s\S]*?Không thể đăng xuất trên server/);
});
test('F11 FE 38 coordinator never stores refresh tokens or process scope authority', () => {
  const source = coordinator();
  assert.doesNotMatch(source, /refreshToken/);
  assert.doesNotMatch(source, /process_ids|allowedProcesses|manager_processes/);
});
test('F11 FE 39 browser refresh still uses HttpOnly cookie credentials', () => {
  assert.match(api(), /withCredentials: true/);
});
test('F11 FE 40 frontend coordination itself does not own database migrations', () => {
  const canonicalSnapshot = path.resolve(root, 'backend', 'database', 'KTC_FULL_DATABASE_CANONICAL_20260817.sql');
  assert.ok(fs.existsSync(canonicalSnapshot));
  const frontendSource = [coordinator(), api(), authService()].join('\n');
  assert.doesNotMatch(frontendSource, /024_logical_duplicate_report_lock/);
});


test('F11 FE 41 Web Locks is the atomic cross-tab leader authority when supported', () => {
  const source = coordinator();
  assert.match(source, /navigator as Navigator & \{ locks\?: WebLockManagerLike \}/);
  assert.match(source, /manager\.request\(LOCK_KEY, \{ mode: "exclusive", ifAvailable: true \}/);
  assert.match(source, /if \(!lock\) return null/);
});

test('F11 FE 42 localStorage fallback elects from unique intents before singleton lease write', () => {
  const source = coordinator();
  const acquire = source.match(/async function tryAcquireStorageLease[\s\S]*?interface WebLockManagerLike/)?.[0] || '';
  assert.match(acquire, /localStorage\.setItem\(intentKey\(tabId\), JSON\.stringify\(intent\)\)/);
  assert.match(acquire, /const contenders = readActiveIntents\(\)/);
  assert.match(acquire, /const winner = contenders\[0\]/);
  const electionIndex = acquire.indexOf('const winner = contenders[0]');
  const leaseWriteIndex = acquire.indexOf('writeLease(candidate)');
  assert.ok(electionIndex >= 0 && leaseWriteIndex > electionIndex);
});

test('F11 FE 43 fallback intent election is deterministic and stale intents expire', () => {
  const source = coordinator();
  assert.match(source, /INTENT_TTL_MS = 1_000/);
  assert.match(source, /intent\.expiresAt <= now/);
  assert.match(source, /left\.createdAt - right\.createdAt \|\| left\.owner\.localeCompare\(right\.owner\)/);
});
