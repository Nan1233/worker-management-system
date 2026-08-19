#!/usr/bin/env node
'use strict';

/**
 * Production runtime gate.
 *
 * Usage:
 *   KTC_PRODUCTION_API_URL=https://.../api node scripts/productionRuntimeGate.cjs
 *   KTC_PRODUCTION_API_URL=https://.../api KTC_PRODUCTION_WEB_URL=https://... node scripts/productionRuntimeGate.cjs
 *
 * This is intentionally read-only. It verifies the deployed API readiness
 * contract, including the canonical DB schema version. It never mutates DB,
 * deploys, or invokes GitHub Actions.
 */

const assert = require('node:assert/strict');

const apiBase = String(
  process.env.KTC_PRODUCTION_API_URL ||
  process.env.VITE_API_URL ||
  ''
).trim().replace(/\/+$/, '');

const webUrl = String(process.env.KTC_PRODUCTION_WEB_URL || '').trim().replace(/\/+$/, '');
const expectedSchema = Number(process.env.KTC_EXPECTED_SCHEMA_VERSION || 26);
const timeoutMs = Math.max(1000, Math.min(15000, Number(process.env.KTC_RUNTIME_GATE_TIMEOUT_MS || 8000)));

if (!apiBase) {
  throw new Error('Thiếu KTC_PRODUCTION_API_URL (ví dụ https://worker-management-system-2-5jqv.onrender.com/api)');
}

async function getJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      headers: { 'cache-control': 'no-cache', accept: 'application/json' },
      signal: controller.signal,
    });
    let body = null;
    try { body = await response.json(); } catch (_) {}
    return { response, body };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const ready = await getJson(`${apiBase}/health/ready`);
  assert.equal(
    ready.response.status,
    200,
    `Production API readiness failed: HTTP ${ready.response.status} ${JSON.stringify(ready.body)}`
  );
  assert.equal(ready.body?.success, true, 'Production API readiness success=false');
  assert.equal(ready.body?.status, 'ready', `Production API status=${ready.body?.status}`);
  assert.equal(ready.body?.schemaReady, true, 'Production DB schemaReady=false');
  assert.equal(
    Number(ready.body?.schemaContractVersion),
    expectedSchema,
    `Production DB schema contract mismatch: expected ${expectedSchema}, got ${ready.body?.schemaContractVersion}`
  );

  const health = await getJson(`${apiBase}/health`);
  assert.equal(health.response.status, 200, `Production API health failed: HTTP ${health.response.status}`);
  assert.equal(health.body?.status, 'ready', 'Production API health is not ready');

  if (webUrl) {
    const web = await fetch(webUrl, {
      method: 'GET',
      cache: 'no-store',
      headers: { 'cache-control': 'no-cache' },
    });
    assert.ok(web.ok, `Production web failed: HTTP ${web.status}`);
    const html = await web.text();
    assert.match(html, /<html[\s>]/i, 'Production web response is not HTML');
  }

  console.log(JSON.stringify({
    success: true,
    api: apiBase,
    web: webUrl || null,
    schemaContractVersion: Number(ready.body.schemaContractVersion),
    databaseLatencyMs: ready.body.databaseLatencyMs ?? null,
    appVersion: ready.body.appVersion ?? null,
    webChecked: Boolean(webUrl),
    readOnly: true,
  }, null, 2));
}

main().catch((error) => {
  console.error('[KTC] Production runtime gate FAILED:', error?.message || error);
  process.exitCode = 1;
});
