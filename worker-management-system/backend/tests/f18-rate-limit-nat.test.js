const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  authenticatedIdentityKey,
  requestUserKey,
  routeUserKey,
  loginAccountKey,
  loginNetworkKey,
  refreshCredentialKey,
  safeClientIp,
} = require('../services/rateLimitIdentityService');
const { resolveTrustProxySetting } = require('../services/proxyTrustPolicy');

function req({ ip='203.0.113.10', user=null, token='', username='', refreshToken='', cookie='', xff='' }={}) {
  return {
    ip,
    socket: { remoteAddress: ip },
    user,
    body: { username, refreshToken },
    headers: {
      authorization: token ? `Bearer ${token}` : '',
      cookie,
      'x-forwarded-for': xff,
    },
    baseUrl: '/api/reports/export-excel',
    path: '/export-excel',
  };
}

const verify = (token) => {
  const m = /^user-(\d+)$/.exec(token);
  if (!m) throw new Error('invalid');
  return { id: Number(m[1]), username: `u${m[1]}` };
};

test('50 authenticated workers on one NAT have 50 distinct global identities', () => {
  const keys = new Set();
  for (let i=1;i<=50;i++) keys.add(authenticatedIdentityKey(req({ token:`user-${i}` }), verify));
  assert.equal(keys.size, 50);
});

test('one abusive worker remains one identity bucket', () => {
  const keys = Array.from({length:20}, () => authenticatedIdentityKey(req({ token:'user-7' }), verify));
  assert.equal(new Set(keys).size, 1);
  assert.equal(keys[0], 'user:7');
});

test('same authenticated worker changing IP does not bypass identity limiter', () => {
  const a = authenticatedIdentityKey(req({ ip:'198.51.100.1', token:'user-9' }), verify);
  const b = authenticatedIdentityKey(req({ ip:'203.0.113.99', token:'user-9' }), verify);
  assert.equal(a, b);
});

test('login brute force has account identity independent of IP plus bounded network key', () => {
  const a = loginAccountKey(req({ ip:'198.51.100.1', username:' Worker599 ' }));
  const b = loginAccountKey(req({ ip:'203.0.113.2', username:'worker599' }));
  assert.equal(a, b);
  assert.notEqual(loginNetworkKey(req({ip:'198.51.100.1'})), loginNetworkKey(req({ip:'203.0.113.2'})));
});

test('forged X-Forwarded-For is ignored by rate-limit IP identity', () => {
  const r = req({ ip:'192.0.2.10', xff:'8.8.8.8' });
  assert.equal(safeClientIp(r), '192.0.2.10');
  const forged = loginNetworkKey(r);
  r.headers['x-forwarded-for'] = '1.1.1.1';
  assert.equal(loginNetworkKey(r), forged);
});

test('trust proxy defaults off and Render resolves to exactly one hop', () => {
  assert.equal(resolveTrustProxySetting({}), false);
  assert.equal(resolveTrustProxySetting({ RENDER:'true' }), 1);
  assert.equal(resolveTrustProxySetting({ RENDER_SERVICE_ID:'srv' }), 1);
  assert.equal(resolveTrustProxySetting({ KTC_TRUST_PROXY_HOPS:'2' }), 2);
  assert.throws(() => resolveTrustProxySetting({ KTC_TRUST_PROXY_HOPS:'99' }), /out of allowed range/);
});

test('refresh limiter identity follows refresh credential, not NAT IP', () => {
  const a = refreshCredentialKey(req({ ip:'198.51.100.1', refreshToken:'refresh-A' }));
  const b = refreshCredentialKey(req({ ip:'203.0.113.2', refreshToken:'refresh-A' }));
  const c = refreshCredentialKey(req({ ip:'198.51.100.1', refreshToken:'refresh-B' }));
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test('expensive endpoint limiter isolates authenticated users and includes route', () => {
  const a = req({ user:{id:1} });
  const b = req({ user:{id:2} });
  assert.notEqual(routeUserKey(a), routeUserKey(b));
  assert.equal(requestUserKey(a), 'user:1');
});

test('429 contract is stable and Retry-After capable through standard headers', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'middleware', 'rateLimiters.js'), 'utf8');
  assert.match(src, /standardHeaders:\s*'draft-8'/);
  assert.match(src, /statusCode:\s*429/);
  assert.match(src, /Retry-After/);
  assert.match(src, /code, message/);
  assert.match(src, /RATE_LIMITED/);
  assert.match(src, /REFRESH_RATE_LIMITED/);
  assert.doesNotMatch(src, /status\s*\(\s*500\s*\)/);
});

test('refresh throttling occurs before controller and cannot mutate session family', () => {
  const routes = fs.readFileSync(path.join(__dirname, '..', 'routes', 'authRoutes.js'), 'utf8');
  assert.match(routes, /router\.post\("\/refresh",\s*refreshLimiter,\s*authController\.refresh\)/s);
});

test('worker report limiter is after authentication and identity keyed', () => {
  const routes = fs.readFileSync(path.join(__dirname, '..', 'routes', 'productionTempRoutes.js'), 'utf8');
  assert.match(routes, /authMiddleware,\s*workerReportLimiter,\s*checkRole\("worker"\)/s);
});

test('global limiter is mounted before routes but verifies bearer identity', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', '..', 'backend', 'server.js'), 'utf8');
  const limiter = fs.readFileSync(path.join(__dirname, '..', 'middleware', 'rateLimiters.js'), 'utf8');
  assert.match(server, /app\.use\("\/api", globalApiLimiter\)/);
  assert.match(limiter, /authenticatedIdentityKey\(req, \(token\) => jwt\.verify/);
});
