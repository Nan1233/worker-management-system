const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'authController.js'), 'utf8');

test('Electron body refresh-token fallback excludes HTTP(S) browser origins while allowing opaque file origins', () => {
  const block = source.slice(source.indexOf('function shouldReturnRefreshToken'), source.indexOf('function getRefreshTokenExpiresAt'));
  assert.match(block, /origin === "null"/);
  assert.match(block, /origin\.startsWith\("file:"\)/);
  assert.match(block, /\/electron\/i\.test\(userAgent\) && isOpaqueNativeOrigin/);
});
