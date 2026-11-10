#!/usr/bin/env node
'use strict';

/**
 * Post-deploy smoke test for the KTC TEST environment (Cloudflare Workers).
 * Runs from a GitHub Actions runner. Read-only except normal sign-ins (which create a refresh session
 * and a LOGIN audit row, exactly like a person signing in). Never prints passwords or tokens.
 *
 * Env:
 *   KTC_TEST_BACKEND_URL, KTC_TEST_FRONTEND_URL      (defaults: the ktc-*-test workers.dev hosts)
 *   KTC_SMOKE_WAIT_SECONDS                          wait for the new deploy (default 900)
 *   KTC_TEST_SUPERADMIN_USERNAME / _PASSWORD        optional (GitHub secrets) → authenticated checks
 *   KTC_TEST_ADMIN_USERNAME / _PASSWORD             optional → regular-admin isolation checks
 *   KTC_TEST_WORKER_CODE                            optional → worker login + isolation checks
 */

const crypto = require('node:crypto');

const BACKEND = (process.env.KTC_TEST_BACKEND_URL || 'https://ktc-be-test.nan978971.workers.dev').replace(/\/+$/, '');
const FRONTEND = (process.env.KTC_TEST_FRONTEND_URL || 'https://ktc-fe-test.nan978971.workers.dev').replace(/\/+$/, '');
const WAIT_SECONDS = Number(process.env.KTC_SMOKE_WAIT_SECONDS || 900);
const EXPECTED_ADMINS = ['nagata', 'nguyenxuanthang'];

const results = [];
const record = (name, status, detail = '') => { results.push({ name, status, detail }); console.log(`${status.padEnd(4)} ${name}${detail ? ` — ${detail}` : ''}`); };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function call(method, path, { token, body, base = BACKEND } = {}) {
  const headers = { Accept: 'application/json' };
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${base}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: response.status, json, text };
}

async function check(name, fn) {
  try {
    const detail = await fn();
    record(name, 'PASS', typeof detail === 'string' ? detail : '');
  } catch (error) {
    record(name, 'FAIL', error.message);
  }
}
const expect = (condition, message) => { if (!condition) throw new Error(message); };

async function waitFor(name, probe) {
  const deadline = Date.now() + WAIT_SECONDS * 1000;
  let last = '';
  while (Date.now() < deadline) {
    try { const ok = await probe(); if (ok === true) return; last = String(ok || ''); } catch (error) { last = error.message; }
    await sleep(15000);
  }
  throw new Error(`${name}: timed out after ${WAIT_SECONDS}s (${last})`);
}

function forgedToken(payload) {
  // Signed with a random key, not the server secret: must be rejected.
  const enc = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const head = enc({ alg: 'HS256', typ: 'JWT' });
  const body = enc({ ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 600 });
  const sig = crypto.createHmac('sha256', crypto.randomBytes(32)).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

async function login(username, password, accessType) {
  const r = await call('POST', '/api/auth/login', { body: { username, password, access_type: accessType, device_name: 'ktc-ci-smoke' } });
  return { status: r.status, token: r.json?.accessToken || r.json?.token || null, user: r.json?.user || null, message: r.json?.message || null, code: r.json?.code || null };
}

async function main() {
  // 1. Wait until the Master Control backend and frontend from this commit are live.
  await check('backend deploy contains /api/admin/control (401 without token, not 404)', async () => {
    await waitFor('backend deploy', async () => { const r = await call('GET', '/api/admin/control/session'); return r.status === 401 ? true : `HTTP ${r.status}`; });
    return 'route live';
  });
  await check('frontend deploy serves Master Control bundle', async () => {
    await waitFor('frontend deploy', async () => {
      // HashRouter serves routes from the SPA root. Vite base "./" produces
      // relative asset URLs (./assets/...), while other builds use /assets/...
      const page = await call('GET', '/', { base: FRONTEND });
      if (page.status !== 200 || !/<div id="root">/i.test(page.text)) return `HTTP ${page.status} or missing React root`;
      const scripts = [...page.text.matchAll(/<script\\b[^>]*\\bsrc=["']([^"']+\\.js(?:\\?[^"']*)?)["']/gi)]
        .map((match) => match[1])
        .filter((src) => /(?:^|\\/)assets\\//.test(src));
      if (!scripts.length) return 'no Vite /assets/*.js script references in frontend HTML';
      for (const src of scripts) {
        const assetUrl = new URL(src, `${FRONTEND}/`);
        if (assetUrl.origin !== new URL(FRONTEND).origin) continue;
        const js = await call('GET', `${assetUrl.pathname}${assetUrl.search}`, { base: FRONTEND });
        if (js.status === 200 && js.text.includes('Master Control Center')) return true;
      }
      return `checked ${scripts.length} Vite script(s); Master Control marker not found`;
    });
    return '/admin/master-control → 200, bundle contains Master Control Center';
  });

  // 2. Health.
  await check('GET /api/health/live = 200', async () => { const r = await call('GET', '/api/health/live'); expect(r.status === 200, `HTTP ${r.status}`); return `version ${r.json?.version}`; });
  await check('GET /api/health/ready = 200 READY', async () => {
    const r = await call('GET', '/api/health/ready');
    expect(r.status === 200 && r.json?.status === 'ready', `HTTP ${r.status} ${r.json?.schemaStatus || ''}`);
    return `schema ${r.json?.schemaStatus} v${r.json?.schemaContractVersion}, app ${r.json?.appVersion}`;
  });

  // 3. Unauthenticated / forged access.
  await check('no token → 401 on Master Control', async () => { const r = await call('GET', '/api/admin/control/overview'); expect(r.status === 401, `HTTP ${r.status}`); return r.json?.code; });
  await check('forged JWT claiming super_admin → 401', async () => {
    const r = await call('GET', '/api/admin/control/overview', { token: forgedToken({ id: 240002, username: 'superadmin', role: 'super_admin', is_super_admin: true }) });
    expect(r.status === 401, `HTTP ${r.status}`); return r.json?.code;
  });
  await check('unknown account cannot log in', async () => {
    const r = await login(`ci-nonexistent-${crypto.randomBytes(4).toString('hex')}`, 'x', 'management');
    expect(r.status >= 400 && r.status < 500 && !r.token, `HTTP ${r.status}`); return `HTTP ${r.status}`;
  });

  // 4. Super Admin (only when the password is provided as a secret).
  const saUser = process.env.KTC_TEST_SUPERADMIN_USERNAME || 'superadmin';
  const saPass = process.env.KTC_TEST_SUPERADMIN_PASSWORD;
  let saToken = null;
  if (!saPass) record('Super Admin login + Master Control', 'SKIP', 'secret KTC_TEST_SUPERADMIN_PASSWORD not set');
  else {
    await check('Super Admin login', async () => {
      const r = await login(saUser, saPass, 'management');
      expect(r.status === 200 && r.token, `HTTP ${r.status} ${r.message || ''}`);
      expect(r.user?.role === 'admin' && r.user?.is_super_admin === true, `role=${r.user?.role} is_super_admin=${r.user?.is_super_admin}`);
      saToken = r.token;
      return `user id ${r.user.id}, role admin + is_super_admin (from DB)`;
    });
    if (saToken) {
      await check('Super Admin: GET /api/admin/control/session', async () => { const r = await call('GET', '/api/admin/control/session', { token: saToken }); expect(r.status === 200 && r.json?.data?.isSuperAdmin === true, `HTTP ${r.status}`); return 'isSuperAdmin=true'; });
      await check('Super Admin: overview has real counts', async () => {
        const r = await call('GET', '/api/admin/control/overview', { token: saToken });
        expect(r.status === 200 && r.json?.data?.counts, `HTTP ${r.status} db=${r.json?.data?.database?.status}`);
        const c = r.json.data.counts;
        expect(c.users.superAdmins >= 1, `superAdmins=${c.users.superAdmins}`);
        return `users ${c.users.total}, super_admin ${c.users.superAdmins}, admin ${c.users.admins}, pending ${c.pendingApprovals}, DB ${r.json.data.database.latencyMs} ms`;
      });
      await check('existing admins nagata / nguyenxuanthang are still role admin', async () => {
        const r = await call('GET', '/api/admin/control/users?role=admin&pageSize=100', { token: saToken });
        expect(r.status === 200, `HTTP ${r.status}`);
        const names = (r.json.data.items || []).map((u) => String(u.username).toLowerCase());
        for (const name of EXPECTED_ADMINS) expect(names.includes(name), `${name} missing from role=admin`);
        const supers = await call('GET', '/api/admin/control/users?role=super_admin&pageSize=100', { token: saToken });
        const superNames = (supers.json?.data?.items || []).map((u) => String(u.username).toLowerCase());
        expect(EXPECTED_ADMINS.every((n) => !superNames.includes(n)), 'an existing admin was changed to super_admin');
        expect(superNames.includes(saUser.toLowerCase()), 'superadmin not listed as super_admin');
        return `admin: ${EXPECTED_ADMINS.join(', ')}; super_admin: ${superNames.join(', ')}`;
      });
      for (const [label, path] of [['users', '/api/admin/control/users?pageSize=5'], ['permission matrix', '/api/admin/control/permissions/matrix'], ['audit', '/api/admin/control/audit?pageSize=5'], ['health', '/api/admin/control/health'], ['database explorer', '/api/admin/control/database/tables'], ['configuration', '/api/admin/control/configuration'], ['legacy permission matrix', '/api/permissions/matrix']]) {
        await check(`Super Admin: ${label} → 200`, async () => {
          const r = await call('GET', path, { token: saToken });
          expect(r.status === 200, `HTTP ${r.status} ${r.json?.code || ''}`);
          expect(!/"password"\s*:/.test(r.text) && !/\$2[aby]\$\d\d\$/.test(r.text), 'response contains password data');
          return 'no password fields';
        });
      }
      await check('Super Admin: SUPER_ADMIN_BOOTSTRAPPED audit present', async () => {
        const r = await call('GET', '/api/admin/control/audit?action=SUPER_ADMIN_BOOTSTRAPPED&pageSize=5', { token: saToken });
        expect(r.status === 200, `HTTP ${r.status}`);
        expect((r.json.data.items || []).length >= 1, 'no SUPER_ADMIN_BOOTSTRAPPED row (account may have been created without the bootstrap script)');
        return `${r.json.data.items.length} row(s)`;
      });
    }
  }

  // 5. Regular admin isolation (optional secret).
  if (!process.env.KTC_TEST_ADMIN_USERNAME || !process.env.KTC_TEST_ADMIN_PASSWORD) record('regular admin isolation', 'SKIP', 'secrets KTC_TEST_ADMIN_USERNAME / KTC_TEST_ADMIN_PASSWORD not set');
  else {
    const r = await login(process.env.KTC_TEST_ADMIN_USERNAME, process.env.KTC_TEST_ADMIN_PASSWORD, 'management');
    await check('regular admin login (role admin, not super admin)', async () => { expect(r.status === 200 && r.token, `HTTP ${r.status}`); expect(r.user?.role === 'admin' && r.user?.is_super_admin === false, `role=${r.user?.role} is_super_admin=${r.user?.is_super_admin}`); return 'ok'; });
    if (r.token) {
      await check('regular admin: Master Control → 403 SUPER_ADMIN_REQUIRED', async () => { const x = await call('GET', '/api/admin/control/overview', { token: r.token }); expect(x.status === 403 && x.json?.code === 'SUPER_ADMIN_REQUIRED', `HTTP ${x.status} ${x.json?.code}`); return 'denied'; });
      await check('regular admin: existing admin APIs still work', async () => { const x = await call('GET', '/api/permissions/matrix', { token: r.token }); expect(x.status === 200, `HTTP ${x.status}`); return '/api/permissions/matrix 200'; });
      await check('regular admin cannot change a super_admin permission (guard)', async () => {
        const x = await call('PUT', '/api/permissions/users/240002/REPORT_EXPORT', { token: r.token, body: { allowed: false } });
        expect(x.status === 403 && x.json?.code === 'PRIVILEGED_TARGET_FORBIDDEN', `HTTP ${x.status} ${x.json?.code}`); return 'denied, nothing written';
      });
    }
  }

  // 6. Worker isolation (optional).
  if (!process.env.KTC_TEST_WORKER_CODE) record('worker isolation', 'SKIP', 'secret KTC_TEST_WORKER_CODE not set');
  else {
    const w = await login(process.env.KTC_TEST_WORKER_CODE, '', 'worker');
    await check('worker login (worker code)', async () => { expect(w.status === 200 && w.token && w.user?.role === 'worker', `HTTP ${w.status}`); return 'ok'; });
    if (w.token) await check('worker: Master Control → 403', async () => { const x = await call('GET', '/api/admin/control/overview', { token: w.token }); expect(x.status === 403, `HTTP ${x.status}`); return x.json?.code; });
  }

  const failed = results.filter((r) => r.status === 'FAIL');
  const summary = `PASS ${results.filter((r) => r.status === 'PASS').length} · FAIL ${failed.length} · SKIP ${results.filter((r) => r.status === 'SKIP').length}`;
  console.log(`\n${summary}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const rows = results.map((r) => `| ${r.status} | ${r.name} | ${String(r.detail || '').replace(/\|/g, '/')} |`).join('\n');
    require('node:fs').appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### KTC TEST post-deploy smoke\n\n${summary}\n\n| Result | Check | Detail |\n|---|---|---|\n${rows}\n`);
  }
  if (failed.length) process.exitCode = 1;
}

main().catch((error) => { console.error(`[KTC] smoke crashed: ${error.message}`); process.exitCode = 1; });
