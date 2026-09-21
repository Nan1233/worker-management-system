#!/usr/bin/env node
'use strict';
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const url = String(process.env.LOCAL_BACKEND_URL || 'http://127.0.0.1:19080').toLowerCase();
if (/onrender\.com|tidbcloud/i.test(url)) {
  console.error('KTC_STAGING_E2E_BLOCKED: write-path E2E cannot target Render/TiDB production.');
  process.exit(1);
}

// Never allow the write-path E2E runner to start unless the local DB is the
// dedicated E2E database. This guard is intentionally separate from the
// application connection so a misconfigured test environment fails closed.
const guard = spawnSync(
  process.execPath,
  [path.resolve(__dirname, '../backend/scripts/e2e-db-guard.cjs')],
  { stdio: 'inherit', env: process.env }
);
if ((guard.status ?? 1) !== 0) {
  console.error('KTC_STAGING_E2E_BLOCKED: E2E database guard failed.');
  process.exit(2);
}

const result = spawnSync(
  process.execPath,
  [path.resolve(__dirname, 'zero-cost/critical-e2e.cjs')],
  { stdio: 'inherit', env: process.env }
);
process.exit(result.status ?? 1);
