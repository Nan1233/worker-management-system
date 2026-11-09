#!/usr/bin/env node
'use strict';
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

// Critical E2E is write-capable. Route it through stagingE2E so the
// dedicated database guard runs BEFORE any fixture or API writes.
const commands = [
  ['critical business E2E (guarded)', 'node', ['scripts/stagingE2E.cjs']],
  ['large-data performance', 'node', ['scripts/performanceLargeData.cjs']],
  ['runtime security', 'node', ['scripts/securityRuntimeAudit.cjs']],
];
for (const [name, cmd, args] of commands) {
  const result = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', env: process.env });
  if (result.error || result.status !== 0) {
    console.error(`KTC_STAGING_RELEASE_GATE_FAIL=${name}`);
    if (result.error) console.error(result.error.message);
    process.exit(result.status || 1);
  }
}
console.log('KTC_STAGING_RELEASE_GATE=PASS');
