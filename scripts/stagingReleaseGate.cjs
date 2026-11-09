#!/usr/bin/env node
'use strict';
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

// Critical E2E is write-capable. Route it through stagingE2E so the
// dedicated database guard runs BEFORE any fixture or API writes.
const timeoutMs = Number(process.env.KTC_STAGING_GATE_STEP_TIMEOUT_MS ?? 900000);
if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 3600000) {
  console.error('KTC_STAGING_RELEASE_GATE_BLOCKED: timeout must be 1000..3600000 ms');
  process.exit(2);
}
const commands = [
  ['critical business E2E (guarded)', process.execPath, ['scripts/stagingE2E.cjs']],
  ['large-data performance', process.execPath, ['scripts/performanceLargeData.cjs']],
  ['runtime security', process.execPath, ['scripts/securityRuntimeAudit.cjs']],
];
for (const [name, cmd, args] of commands) {
  const result = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', env: process.env, timeout: timeoutMs, killSignal: 'SIGTERM' });
  if (result.error || result.signal || result.status !== 0) {
    console.error(`KTC_STAGING_RELEASE_GATE_FAIL=${name}`);
    if (result.error) console.error(result.error.message);
    if (result.signal) console.error(`KTC_STAGING_RELEASE_GATE_SIGNAL=${result.signal}`);
    process.exit(Number.isInteger(result.status) && result.status > 0 ? result.status : 1);
  }
}
console.log('KTC_STAGING_RELEASE_GATE=PASS');
