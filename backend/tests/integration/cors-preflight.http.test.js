'use strict';

// Real HTTP: a browser on another origin (the web app is served separately from
// the API) sends a CORS preflight before every request that carries custom
// headers. The frontend adds Cache-Control/Pragma to report reads, so the API
// must allow them or every report detail / history call fails with "Network Error".

const test = require('node:test');
const assert = require('node:assert/strict');
const h = require('./harness');

const opts = { skip: h.skipReason };

test.before(async () => { if (h.enabled) await h.start(); });
test.after(async () => { if (h.enabled) await h.stop(); });

const preflight = (requestHeaders, origin = 'http://localhost:5173') => h.request('OPTIONS', '/api/production-temp/1', {
  headers: { Origin: origin, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': requestHeaders }
});

test('preflight allows the headers the web app sends on report reads', opts, async () => {
  const res = await preflight('authorization,cache-control,pragma');
  assert.ok([200, 204].includes(res.status), `status ${res.status}`);
  const allowed = String(res.headers.get('access-control-allow-headers') || '').toLowerCase();
  for (const header of ['authorization', 'cache-control', 'pragma', 'content-type']) {
    assert.ok(allowed.includes(header), `Access-Control-Allow-Headers must include ${header}, got "${allowed}"`);
  }
  assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:5173');
});

test('preflight from an unknown origin is denied', opts, async () => {
  const res = await preflight('authorization', 'https://evil.example');
  assert.equal(res.status, 403);
  assert.notEqual(res.headers.get('access-control-allow-origin'), 'https://evil.example');
});
