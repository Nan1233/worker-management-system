const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeLogDetails, safeUrlForLog } = require('../electron/desktopLog.cjs');

test('desktop log sanitizer removes secret values and local path identity', () => {
  const sanitized = sanitizeLogDetails({
    refreshToken: 'secret-token',
    password: 'secret-password',
    filePath: 'C:\\Users\\Alice\\Documents\\KTC\\Bao-cao.xlsx',
    userData: 'C:\\Users\\Alice\\AppData\\KTC',
  });
  assert.equal(sanitized.refreshToken, '[REDACTED]');
  assert.equal(sanitized.password, '[REDACTED]');
  assert.ok(!String(sanitized.filePath).includes('Alice'));
  assert.ok(!String(sanitized.userData).includes('Alice'));
});

test('desktop log sanitizer strips URL query and fragment', () => {
  assert.equal(safeUrlForLog('https://example.test/api/reports?search=EMP001#x'), 'https://example.test/api/reports');
  const sanitized = sanitizeLogDetails({ url: 'https://example.test/api/reports?search=EMP001' });
  assert.equal(sanitized.url, 'https://example.test/api/reports');
});
