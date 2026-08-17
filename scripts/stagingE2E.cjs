#!/usr/bin/env node
'use strict';
const { spawnSync } = require('node:child_process');
const url = String(process.env.LOCAL_BACKEND_URL || 'http://127.0.0.1:19080').toLowerCase();
if (/onrender\.com|tidbcloud/i.test(url)) {
  console.error('KTC_STAGING_E2E_BLOCKED: write-path E2E cannot target Render/TiDB production.');
  process.exit(1);
}
const result = spawnSync(process.execPath, [require('node:path').resolve(__dirname, 'zero-cost/critical-e2e.cjs')], { stdio: 'inherit', env: process.env });
process.exit(result.status ?? 1);
