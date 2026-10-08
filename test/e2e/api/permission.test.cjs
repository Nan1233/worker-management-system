'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { useApi, useWriteContext, needs } = require('./context.cjs');

const api = useApi('api');
const write = useWriteContext('api');

const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
function forgedToken(payload, { alg = 'HS256', secret = crypto.randomBytes(32) } = {}) {
  const head = b64({ alg, typ: 'JWT' });
  const body = b64({ iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600, ...payload });
  if (alg === 'none') return `${head}.${body}.`;
  return `${head}.${body}.${crypto.createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url')}`;
}

test('manager-only actions without a token are 401', async () => {
  const client = api.client();
  assert.equal((await client.req('POST', '/api/production-temp/approve-selected', { ids: [1] })).status, 401);
  assert.equal((await client.req('POST', '/api/production-temp/reject-selected', { ids: [1] })).status, 401);
  assert.equal((await client.req('POST', '/api/reports/export-excel', { date: '2026-09-01' })).status, 401);
});

test('JWT signed with a foreign secret is rejected', async () => {
  const client = api.client();
  client.token = forgedToken({ id: 1, role: 'admin', username: 'admin' });
  const r = await client.req('GET', '/api/production-temp/pending');
  assert.equal(r.status, 401);
});

test('JWT with alg "none" is rejected', async () => {
  const client = api.client();
  client.token = forgedToken({ id: 1, role: 'admin', username: 'admin' }, { alg: 'none' });
  const r = await client.req('GET', '/api/production-temp/pending');
  assert.equal(r.status, 401);
});

test('worker cannot review, approve or export', needs(write, async () => {
  const worker = await write.worker();
  assert.equal((await worker.req('GET', '/api/production-temp/pending')).status, 403);
  assert.equal((await worker.req('POST', '/api/production-temp/approve-selected', { ids: [1] })).status, 403);
  assert.equal((await worker.req('GET', '/api/reports/export-excel/company-data?month=2026-09')).status, 403);
}));

test('manager cannot submit a worker report', needs(write, async () => {
  const manager = await write.manager();
  const r = await manager.req('POST', '/api/production-temp', { process_id: write.ctx.fixture.gcProcessId });
  assert.equal(r.status, 403);
}));
