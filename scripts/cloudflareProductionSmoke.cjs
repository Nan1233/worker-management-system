#!/usr/bin/env node
'use strict';

/**
 * Read-only Cloudflare production smoke test.
 *
 * Required:
 *   KTC_CLOUDFLARE_API_URL=https://ktc-backend....workers.dev
 *   KTC_E2E_WORKER_CODE=<safe worker fixture>
 *   KTC_E2E_MANAGER_USERNAME=<safe manager fixture>
 *   KTC_E2E_MANAGER_PASSWORD=<safe manager fixture>
 *
 * This never creates, edits, approves, rejects or deletes production data.
 */
const { Client } = require('./zero-cost/http.cjs');

const base = String(process.env.KTC_CLOUDFLARE_API_URL || '').replace(/\/$/, '');
const workerCode = String(process.env.KTC_E2E_WORKER_CODE || '').trim();
const managerUsername = String(process.env.KTC_E2E_MANAGER_USERNAME || '').trim();
const managerPassword = String(process.env.KTC_E2E_MANAGER_PASSWORD || '');
const date = /^\d{4}-\d{2}-\d{2}$/.test(String(process.env.KTC_E2E_DATE || ''))
  ? String(process.env.KTC_E2E_DATE)
  : new Date().toISOString().slice(0, 10);

if (!base) throw new Error('KTC_CLOUDFLARE_API_URL is required');
if (!workerCode) throw new Error('KTC_E2E_WORKER_CODE is required');
if (!managerUsername || !managerPassword) throw new Error('KTC_E2E_MANAGER_USERNAME and KTC_E2E_MANAGER_PASSWORD are required');

const checks = [];
function check(name, ok, evidence) {
  checks.push({ name, result: ok ? 'PASS' : 'FAIL', evidence });
  if (!ok) process.exitCode = 1;
}

async function main() {
  const worker = new Client(base);
  const manager = new Client(base);

  let r = await worker.req('GET', '/api/health/live');
  check('Cloudflare live', r.status === 200 && r.data?.status === 'live', `HTTP ${r.status}`);

  r = await worker.req('GET', '/api/health/ready');
  check('Cloudflare ready + DB', r.status === 200 && r.data?.status === 'ready' && r.data?.schemaReady === true, `HTTP ${r.status}, db=${r.data?.database}, schema=${r.data?.schemaReady}`);

  r = await worker.req('POST', '/api/auth/login', { username: workerCode, access_type: 'worker' });
  check('Worker login', r.status === 200 && Boolean(worker.token), `HTTP ${r.status}`);

  r = await worker.req('GET', '/api/permissions/me');
  check('Worker permissions', r.status === 200, `HTTP ${r.status}`);

  r = await worker.req('GET', '/api/machines');
  check('Machine master', r.status === 200, `HTTP ${r.status}`);

  r = await worker.req('GET', '/api/product-standards');
  const standards = Array.isArray(r.data?.data) ? r.data.data : Array.isArray(r.data) ? r.data : [];
  check('Product standards master', r.status === 200, `HTTP ${r.status}, rows=${standards.length}`);

  for (const machineCode of ['10', '1']) {
    const query = new URLSearchParams({ process_id: '1', machine_code: machineCode, product_code: '2801-LT', work_date: date });
    r = await worker.req('GET', `/api/product-standards/resolve?${query}`);
    const body = r.data?.data || r.data || {};
    const standard = Number(body.standard_output ?? body.output_per_hour ?? body.standard ?? 0);
    check(`2801-LT resolve machine ${machineCode}`, r.status === 200 && standard === 605, `HTTP ${r.status}, standard=${standard}`);
  }

  r = await worker.req('GET', '/api/system/notifications/unread-count');
  check('Worker unread notifications', r.status === 200, `HTTP ${r.status}`);

  r = await worker.req('GET', '/api/production-temp/my');
  check('Worker report history', r.status === 200, `HTTP ${r.status}`);

  r = await manager.req('POST', '/api/auth/login', { username: managerUsername, password: managerPassword, access_type: 'management' });
  check('Manager login', r.status === 200 && Boolean(manager.token), `HTTP ${r.status}`);

  r = await manager.req('GET', '/api/permissions/me');
  check('Manager permissions', r.status === 200, `HTTP ${r.status}`);

  r = await manager.req('GET', '/api/production-temp/pending');
  check('Manager pending reports', r.status === 200, `HTTP ${r.status}`);

  r = await manager.req('GET', `/api/reports/export-excel/company-data?date=${encodeURIComponent(date)}`);
  check('Excel source API', r.status === 200 && Boolean(r.data?.data?.processes), `HTTP ${r.status}`);

  r = await manager.req('POST', '/api/auth/logout', {});
  check('Manager logout', [200, 204].includes(r.status), `HTTP ${r.status}`);

  console.table(checks);
  console.log(`KTC_CLOUDFLARE_SMOKE=${checks.every((item) => item.result === 'PASS') ? 'PASS' : 'FAIL'}`);
}

main().catch((error) => {
  console.error('KTC_CLOUDFLARE_SMOKE_FATAL', error.stack || error.message);
  process.exitCode = 1;
});
