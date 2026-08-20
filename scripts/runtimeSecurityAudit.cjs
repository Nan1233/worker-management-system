#!/usr/bin/env node
'use strict';

/**
 * Runtime security smoke. Read-only.
 * Checks security headers, cache policy and unauthenticated API protection.
 */
const BASE = String(process.env.KTC_SECURITY_API_BASE || process.env.KTC_LOAD_API_BASE || '').replace(/\/$/, '');
if (!BASE) {
  console.error('KTC_SECURITY_API_BASE is required');
  process.exit(1);
}

const failures = [];
function check(ok, name, evidence) {
  if (ok) console.log(`[PASS] ${name}: ${evidence}`);
  else {
    console.error(`[FAIL] ${name}: ${evidence}`);
    failures.push(name);
  }
}

async function req(path, init = {}) {
  const response = await fetch(`${BASE}${path}`, {
    redirect: 'manual',
    ...init,
    signal: AbortSignal.timeout(7000),
  });
  return response;
}

async function main() {
  const live = await req('/api/health/live');
  const headers = Object.fromEntries(live.headers.entries());
  check(live.status === 200, 'health live', `HTTP ${live.status}`);
  check(Boolean(headers['x-content-type-options'] === 'nosniff'), 'X-Content-Type-Options', headers['x-content-type-options'] || 'missing');
  check(Boolean(headers['x-frame-options'] || headers['content-security-policy']), 'anti-clickjacking', headers['x-frame-options'] || 'CSP present');
  check(Boolean(headers['referrer-policy']), 'Referrer-Policy', headers['referrer-policy'] || 'missing');
  check(Boolean(headers['permissions-policy']), 'Permissions-Policy', headers['permissions-policy'] || 'missing');
  check(Boolean(headers['cache-control'] && /no-store/i.test(headers['cache-control'])), 'API cache control', headers['cache-control'] || 'missing');

  const protectedRead = await req('/api/production-temp/my', { headers: { Accept: 'application/json' } });
  check([401, 403].includes(protectedRead.status), 'unauthenticated protected API', `HTTP ${protectedRead.status}`);

  const badJson = await req('/api/production-temp', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{"unexpected":true}',
  });
  check([400, 401, 403, 422].includes(badJson.status), 'unauthenticated write rejection', `HTTP ${badJson.status}`);

  const methodAbuse = await req('/api/health/live', { method: 'TRACE' });
  check([404, 405].includes(methodAbuse.status), 'TRACE disabled', `HTTP ${methodAbuse.status}`);

  console.log(`KTC_RUNTIME_SECURITY=${failures.length ? 'FAIL' : 'PASS'}`);
  if (failures.length) process.exit(1);
}

main().catch(error => {
  console.error('KTC_RUNTIME_SECURITY_FATAL', error.stack || error.message);
  process.exit(1);
});
