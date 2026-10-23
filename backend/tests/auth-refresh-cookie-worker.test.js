'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'unit-test-only-secret';
const Module = require('node:module');
const path = require('node:path');

function load() {
  const target = require.resolve('../controllers/authController');
  delete require.cache[target];
  const original = Module._load;
  Module._load = function (request, parent, ...rest) {
    if (/refreshSessionService$/.test(request)) return { revokeFamilyByRefreshToken: async () => {} };
    if (/auditService$/.test(request)) return { logActivity: async () => {} };
    return original.call(this, request, parent, ...rest);
  };
  try { return require(target); } finally { Module._load = original; }
}

function res() {
  const r = { cleared: null, status: 0, body: null };
  r.clearCookie = (n, o) => { r.cleared = { n, o }; return r; };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
}

async function runLogout(env) {
  const saved = { ...process.env };
  delete process.env.NODE_ENV; delete process.env.KTC_CLOUDFLARE_WORKER;
  Object.assign(process.env, env);
  try {
    const c = load(); const r = res();
    await c.logout({ headers: {}, body: {}, user: null }, r);
    return r;
  } finally { process.env = saved; }
}

test('Cloudflare Worker without NODE_ENV uses Secure + SameSite=None refresh cookie', async () => {
  const r = await runLogout({ KTC_CLOUDFLARE_WORKER: 'true' });
  assert.equal(r.cleared.o.sameSite, 'none');
  assert.equal(r.cleared.o.secure, true);
  assert.equal(r.cleared.o.httpOnly, true);
});

test('local dev keeps Lax non-secure cookie', async () => {
  const r = await runLogout({});
  assert.equal(r.cleared.o.sameSite, 'lax');
  assert.equal(r.cleared.o.secure, false);
});

test('logout without refresh token clears cookie and succeeds', async () => {
  const r = await runLogout({ NODE_ENV: 'production' });
  assert.equal(r.code, 200);
  assert.ok(r.cleared);
});
