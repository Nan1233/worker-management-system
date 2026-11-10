#!/usr/bin/env node
'use strict';
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
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
const steps = [];
function saveEvidence(status) {
  const dir = path.resolve(process.env.KTC_VALIDATION_DIR || 'validation-artifacts');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'staging-release-gate.json'), JSON.stringify({
    status, timeoutMs, steps, generatedAt: new Date().toISOString()
  }, null, 2));
}
for (const [name, cmd, args] of commands) {
  const result = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', env: process.env, timeout: timeoutMs, killSignal: 'SIGTERM' });
  const failed = Boolean(result.error || result.signal || result.status !== 0);
  steps.push({ name, status: failed ? 'FAIL' : 'PASS',
    exitCode: Number.isInteger(result.status) ? result.status : null,
    signal: result.signal || null,
    errorCode: result.error?.code || null });
  if (failed) {
    console.error(`KTC_STAGING_RELEASE_GATE_FAIL=${name}`);
    if (result.error) console.error(result.error.message);
    if (result.signal) console.error(`KTC_STAGING_RELEASE_GATE_SIGNAL=${result.signal}`);
    saveEvidence('FAIL');
    process.exit(Number.isInteger(result.status) && result.status > 0 ? result.status : 1);
  }
}
saveEvidence('PASS');
console.log('KTC_STAGING_RELEASE_GATE=PASS');
