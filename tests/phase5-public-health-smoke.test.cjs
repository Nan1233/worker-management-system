'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { probe, main } = require('../scripts/phase5PublicHealthSmoke.cjs');

const good = (status, payload) => async (url, options) => {
  assert.ok(url.startsWith('https://ktc-'));
  assert.equal(options.method, 'GET');
  assert.equal(options.redirect, 'error');
  assert.equal(options.headers.Authorization, undefined);
  return { status, async json() { return payload; } };
};

test('read-only liveness and readiness validate exact expected responses', async () => {
  assert.equal((await probe('test', '/api/health/live', good(200, { success: true, service: 'ktc-api', status: 'live' }))).pass, true);
  assert.equal((await probe('production', '/api/health/ready', good(200, { success: true, service: 'ktc-api', status: 'ready', database: 'ok', schemaReady: true }))).pass, true);
});

test('rejects 503, invalid schema and malformed JSON', async () => {
  assert.equal((await probe('test', '/api/health/ready', good(503, { success: false, status: 'not_ready' }))).pass, false);
  assert.equal((await probe('test', '/api/health/ready', good(200, { success: true, service: 'ktc-api', status: 'ready', database: 'ok', schemaReady: false }))).pass, false);
  assert.equal((await probe('test', '/api/health/live', async () => ({ status: 200, json: async () => { throw Error('bad'); } }))).reason, 'INVALID_JSON');
});

test('never follows redirects or sends requests to arbitrary origins', async () => {
  await assert.rejects(probe('evil', '/api/health/live', () => { throw Error('should not be called'); }), /Unknown KTC target/);
  assert.equal((await probe('production', '/api/health/live', async () => { throw Object.assign(new Error('network'), { name: 'TimeoutError' }); })).reason, 'TimeoutError');
});
