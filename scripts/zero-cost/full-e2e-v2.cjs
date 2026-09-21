#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const fixturePath = path.resolve(
  process.env.KTC_ZERO_COST_FIXTURE || 'validation-artifacts/fixture.json'
);
const base = String(
  process.env.LOCAL_BACKEND_URL ||
    'https://ktc-be-test.nan978971.workers.dev'
).replace(/\/$/, '');

if (!fs.existsSync(fixturePath)) {
  console.error(`KTC_FULL_E2E_NOT_READY: missing ${fixturePath}`);
  console.error(
    'This runner intentionally does not create fixtures or write to a remote DB.'
  );
  console.error(
    'Use a prepared dedicated E2E database and fixture, then rerun this command.'
  );
  process.exit(2);
}

process.env.LOCAL_BACKEND_URL = base;

let failed = false;

for (const script of [
  'critical-e2e.cjs',
  'historical-dashboard-e2e.cjs',
]) {
  const r = spawnSync(
    process.execPath,
    [path.join(__dirname, script)],
    {
      cwd: root,
      stdio: 'inherit',
      env: process.env,
    }
  );

  if (r.error) {
    console.error(`KTC_FULL_E2E_SCRIPT_ERROR: ${script}: ${r.error.message}`);
    failed = true;
    continue;
  }

  if ((r.status ?? 1) !== 0) failed = true;
}

console.log(`KTC_FULL_E2E=${failed ? 'FAIL' : 'PASS'}`);
process.exit(failed ? 1 : 0);
