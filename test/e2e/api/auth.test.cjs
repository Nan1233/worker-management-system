'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { useApi, useWriteContext, needs } = require('./context.cjs');

const api = useApi('api');
const write = useWriteContext('api');

test('GET /api/health/live answers without leaking configuration', async () => {
  const r = await api.client().req('GET', '/api/health/live');
  assert.equal(r.status, 200);
  assert.equal(r.data.status, 'live');
  assert.doesNotMatch(JSON.stringify(r.data), /password|DB_HOST|JWT_SECRET/i);
});

test('GET /api/health/ready reflects database readiness', async () => {
  const r = await api.client().req('GET', '/api/health/ready');
  if (api.target.mode === 'local-no-db') assert.equal(r.status, 503, 'backend without DB must not claim ready');
  else assert.equal(r.status, 200);
  assert.doesNotMatch(JSON.stringify(r.data), /password|JWT_SECRET/i);
});

test('protected endpoints reject requests without a token (401)', async () => {
  const client = api.client();
  for (const [method, route] of [
    ['GET', '/api/production-temp/my'],
    ['GET', '/api/production-temp/pending'],
    ['POST', '/api/production-temp'],
    ['GET', '/api/reports/export-excel/company-data?month=2026-09']
  ]) {
    const r = await client.req(method, route, method === 'POST' ? {} : undefined);
    assert.equal(r.status, 401, `${method} ${route}`);
  }
});

test('malformed bearer token is rejected with TOKEN_INVALID', async () => {
  const client = api.client();
  client.token = 'abc.def.ghi';
  const r = await client.req('GET', '/api/production-temp/my');
  assert.equal(r.status, 401);
  assert.equal(r.data.code, 'TOKEN_INVALID');
});

test('login validates input before touching the database', async () => {
  const empty = await api.client().req('POST', '/api/auth/login', {});
  assert.equal(empty.status, 400);
  const res = await fetch(`${api.target.baseUrl}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{bad json' });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, 'INVALID_JSON');
});

test('unknown API route answers 404 JSON', async () => {
  const r = await api.client().req('GET', '/api/e2e-does-not-exist');
  assert.equal(r.status, 404);
  assert.equal(r.data.success, false);
});

test('worker login -> refresh -> logout invalidates the session', needs(write, async () => {
  const client = await write.worker();
  assert.ok(client.token, 'access token issued');
  const me = await client.req('GET', '/api/production-temp/my');
  assert.equal(me.status, 200);
  const oldCookie = client.cookies;
  const refresh = await client.req('POST', '/api/auth/refresh', {});
  assert.equal(refresh.status, 200);
  assert.notEqual(client.cookies, oldCookie, 'refresh rotates the cookie');
  const logout = await client.req('POST', '/api/auth/logout', {});
  assert.ok([200, 204].includes(logout.status));
  client.token = '';
  client.cookies = '';
  const after = await client.req('GET', '/api/production-temp/my');
  assert.ok([401, 403].includes(after.status));
}));

test('manager login with a wrong password is refused', needs(write, async () => {
  const r = await write.client('manager-bad').loginManager(write.ctx.fixture.managerUsername, `${write.ctx.fixture.managerPassword}-wrong`);
  assert.ok([400, 401].includes(r.status), `HTTP ${r.status}`);
  assert.ok(!r.data?.accessToken && !r.data?.token);
}));
