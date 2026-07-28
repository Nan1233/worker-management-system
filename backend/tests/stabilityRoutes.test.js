const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('/workers/me is declared before /:id', () => {
  const source = read('routes/workerRoutes.js');
  const me = source.lastIndexOf('router.get(\n\n    "/me"');
  const byId = source.lastIndexOf('router.get(\n\n    "/:id"');
  assert.ok(me >= 0 && byId >= 0 && me < byId);
});

test('unread-count response is normalized and controller only counts', () => {
  const source = read('controllers/systemController.js');
  const start = source.indexOf('exports.getUnreadNotificationCount');
  const end = source.indexOf('exports.markNotificationRead', start);
  const body = source.slice(start, end);
  assert.match(body, /COUNT\(\*\)/);
  assert.match(body, /data:\{unreadCount:/);
  assert.doesNotMatch(body, /backfill|JOIN|INSERT INTO/i);
});

test('version endpoint is mounted', () => {
  assert.match(read('server.js'), /\/api\/version/);
  assert.match(read('config/version.js'), /backendVersion/);
});

test('service worker never handles API requests', () => {
  const source = read('../frontend/public/sw.js');
  assert.match(source, /url\.pathname\.startsWith\("\/api\/"\)/);
  assert.match(source, /if \(isApiRequest\(url\)\) return;/);
});

test('frontend has auth bootstrap and shared refresh promise', () => {
  assert.match(read('../frontend/src/main.tsx'), /AuthBootstrap/);
  const api = read('../frontend/src/services/api.ts');
  assert.match(api, /let refreshPromise/);
  assert.match(api, /initializeAuthSession/);
  const auth = read('../frontend/src/services/authService.ts');
  assert.doesNotMatch(auth, /axios\.post|axios\.create/);
});
