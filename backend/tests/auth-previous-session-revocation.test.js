const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../controllers/authController.js'), 'utf8');
const refreshSessions = fs.readFileSync(path.join(__dirname, '../services/refreshSessionService.js'), 'utf8');
const sessionBlock = source.slice(source.indexOf('async function issueLoginSession'), source.indexOf('exports.login ='));

test('previous refresh-token body is accepted only at the Electron opaque-origin boundary', () => {
  assert.match(sessionBlock, /shouldReturnRefreshToken\(req\)\s*&&[\s\S]*req\.body\?\.previous_refresh_token/);
  assert.match(sessionBlock, /bodyPreviousRefreshToken \|\| parseCookie\(req, REFRESH_COOKIE_NAME\)/);
  assert.match(source, /return \/electron\/i\.test\(userAgent\) && isOpaqueNativeOrigin/);
});

test('revocation infrastructure failure returns 503 before creating a new session family', () => {
  const revokeAt = sessionBlock.indexOf('await refreshSessionService.revokeFamilyByRefreshToken(previousRefreshToken)');
  const failureAt = sessionBlock.indexOf('AUTH_PREVIOUS_SESSION_REVOCATION_FAILED');
  const createAt = sessionBlock.indexOf('await refreshSessionService.createFamilyRoot');
  assert.ok(revokeAt >= 0, 'must attempt old-family revocation');
  assert.ok(failureAt > revokeAt, 'must expose a stable generic failure code');
  assert.ok(createAt > failureAt, 'new family creation must occur only after the fail-closed branch');
  assert.match(sessionBlock, /return res\.status\(503\)\.json\([\s\S]*?code: "AUTH_PREVIOUS_SESSION_REVOCATION_FAILED"/);
  assert.doesNotMatch(sessionBlock, /console\.(?:warn|error)\([^\n]*(?:previousRefreshToken|revokeError)/);
});

test('revocation errors are not logged with token or raw error details', () => {
  const failBlock = sessionBlock.slice(sessionBlock.indexOf('} catch {'), sessionBlock.indexOf('const expiresAt'));
  assert.match(failBlock, /console\.error\("AUTH_PREVIOUS_SESSION_REVOCATION_FAILED"\)/);
  assert.doesNotMatch(failBlock, /previousRefreshToken|revokeError|\.message/);
});

test('unknown previous token remains an allowed no-op', () => {
  const revokeBlock = refreshSessions.slice(
    refreshSessions.indexOf('async function revokeFamilyByRefreshToken'),
    refreshSessions.indexOf('async function revokeAllUserFamilies')
  );
  assert.match(revokeBlock, /if \(!generation\) return \{ found: false, familyId: null \}/);
});
