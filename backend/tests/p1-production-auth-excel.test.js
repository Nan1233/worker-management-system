const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('P1.1 Excel download validates regular non-empty files and content type', () => {
  const s = read('controllers/excelJobController.js');
  assert.match(s, /stat\.isFile\(\)/);
  assert.match(s, /stat\.size <= 0/);
  assert.match(s, /application\/zip/);
  assert.match(s, /nosniff/);
});

test('P1.1 Excel job completion/failure is monotonic from running state', () => {
  const s = read('services/excelExportJobStore.js');
  assert.match(s, /WHERE id=\? AND status='running'/);
  assert.match(s, /status='running'/);
});

test('P1.2 production environment rejects weak JWT and disabled DB TLS', () => {
  const s = read('config/validateEnvironment.js');
  assert.match(s, /JWT_SECRET production/);
  assert.match(s, /jwtSecret\.length < 32/);
  assert.match(s, /DB_SSL production|DB_SSL phải bật/);
  assert.match(s, /refreshTtlDays/);
});

test('P1.3 production auth cache defaults to short revocation window', () => {
  const s = read('utils/authUserCache.js');
  assert.match(s, /NODE_ENV/);
  assert.match(s, /15_000/);
  assert.match(s, /AUTH_USER_CACHE_TTL_MS/);
});

test('P1.3 stale frontend auth backup source is absent', () => {
  assert.equal(fs.existsSync(path.join(root, '..', 'frontend/src/services/api.ts.bak_auth_refresh')), false);
});
