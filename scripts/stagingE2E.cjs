#!/usr/bin/env node
'use strict';
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const target = String(process.env.LOCAL_BACKEND_URL || 'http://127.0.0.1:19080').trim();
let url;
try {
  url = new URL(target);
} catch {
  console.error('KTC_STAGING_E2E_BLOCKED: invalid LOCAL_BACKEND_URL.');
  process.exit(1);
}
const hostname = url.hostname.toLowerCase();
const local = ['localhost', '127.0.0.1', '[::1]'].includes(hostname);
if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash || !local) {
  console.error('KTC_STAGING_E2E_BLOCKED: write-path API must be loopback; remote Workers may point at production data.');
  process.exit(1);
}

// Never allow the write-path E2E runner to start unless the local DB is the
// dedicated E2E database. The DB guard is separate from the application.
const guard = spawnSync(
  process.execPath,
  [path.resolve(__dirname, '../backend/scripts/e2e-db-guard.cjs')],
  { stdio: 'inherit', env: process.env }
);
if (guard.error || (guard.status ?? 1) !== 0) {
  console.error('KTC_STAGING_E2E_BLOCKED: E2E database guard failed.');
  process.exit(2);
}
const result = spawnSync(
  process.execPath,
  [path.resolve(__dirname, 'zero-cost/critical-e2e.cjs')],
  { stdio: 'inherit', env: process.env }
);
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
