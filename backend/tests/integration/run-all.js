'use strict';

// Runs every *.http.test.js in its own node process, one after another. The files share one
// throw-away database (rebuilt by each file), so they must not run in parallel.
// Usage: KTC_IT_DB_* ... node tests/integration/run-all.js

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const dir = __dirname;
const files = fs.readdirSync(dir).filter((name) => name.endsWith('.test.js')).sort();
let failed = 0;

for (const file of files) {
  console.log(`\n=== ${file}`);
  // Daily-hours enforcement is intentionally disabled in KTC production.
  // Activate it only for its dedicated isolated TiDB race test.
  const env = { ...process.env, KTC_IT_ENFORCE_DAILY_HOURS: file === 'daily-hours.http.test.js' ? '1' : '0' };
  const result = spawnSync(process.execPath, ['--test', path.join(dir, file)], { stdio: 'inherit', env });
  if (result.status !== 0) failed += 1;
}

console.log(`\nIntegration files: ${files.length}, failed: ${failed}`);
process.exit(failed ? 1 : 0);
