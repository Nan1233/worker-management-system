#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const backend = path.join(root, 'backend');
const env = { ...process.env };

function run(label, command, args) {
  console.log(`\n[KTC E2E] ${label}`);
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    console.error(`[KTC E2E] ${label} FAILED (exit ${result.status ?? 'unknown'})`);
    process.exit(result.status || 1);
  }
}

// Never allow the write-path suite to run against the production DB.
env.KTC_RUNTIME_ENV_CLASS = 'STAGING';
run('DB safety guard', process.execPath, [path.join(backend, 'scripts', 'e2e-db-guard.cjs')]);

// Build a deterministic fixture in the guarded E2E database.
run('Seed E2E fixture', process.execPath, [path.join(root, 'scripts', 'zero-cost', 'seed-ci.cjs')]);

// Execute the existing 23-step write-path suite.
run('Critical business flow (23 checks)', process.execPath, [path.join(root, 'scripts', 'zero-cost', 'critical-e2e.cjs')]);

console.log('\n[KTC E2E] FULL FLOW PASS');
