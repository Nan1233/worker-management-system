#!/usr/bin/env node
'use strict';

// Public, read-only checks only. Never send auth headers, cookies, credentials,
// query parameters or request bodies to a production service.
const assert = require('node:assert/strict');

const ORIGINS = Object.freeze({
  test: 'https://ktc-be-test.nan978971.workers.dev',
  production: 'https://ktc-backend.nan978971.workers.dev',
});

async function probe(target, path, fetchImpl = fetch) {
  const origin = ORIGINS[target];
  if (!origin) throw new Error('Unknown KTC target (only test or production are allowed)');
  const url = origin + path;
  let response;
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      redirect: 'error',
      signal: AbortSignal.timeout(12000),
      headers: { Accept: 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return { target, path, pass: false, status: null, reason: error?.name || 'NETWORK_ERROR' };
  }
  let data;
  try { data = await response.json(); }
  catch { return { target, path, pass: false, status: response.status, reason: 'INVALID_JSON' }; }
  const live = path === '/api/health/live';
  const pass = response.status === 200 && data?.success === true &&
    data?.service === 'ktc-api' && data?.status === (live ? 'live' : 'ready') &&
    (live || (data?.database === 'ok' && data?.schemaReady === true));
  return { target, path, pass, status: response.status,
    state: typeof data?.status === 'string' ? data.status : 'unknown',
    reason: pass ? undefined : 'UNHEALTHY' };
}

async function main(args = process.argv.slice(2), fetchImpl = fetch) {
  const target = args[0];
  assert.ok(target === 'test' || target === 'production', 'Usage: node scripts/phase5PublicHealthSmoke.cjs test|production');
  const checks = [];
  for (const path of ['/api/health/live', '/api/health/ready']) {
    const result = await probe(target, path, fetchImpl);
    checks.push(result);
    // Never echo full response bodies: a failing endpoint could expose data.
    console.log(JSON.stringify(result));
  }
  return checks.every(x => x.pass);
}

if (require.main === module) {
  main().then(ok => { if (!ok) process.exitCode = 1; })
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { ORIGINS, probe, main };
