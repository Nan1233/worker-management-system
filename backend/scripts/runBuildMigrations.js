'use strict';

// Build gate. It validates the migration file inventory and NOTHING else: it never loads the database
// configuration and never applies a migration. Schema changes are a manual, backed-up operator action
// (scripts/runPendingMigrations.js with KTC_MANUAL_MIGRATION_CONFIRM=YES).
//
// The inventory rules live in verifyMigrationInventory.js (latest version is derived from the files, so
// adding a migration no longer breaks the build); this gate only runs it.

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const result = spawnSync(process.execPath, [path.join(__dirname, 'verifyMigrationInventory.js')], { encoding: 'utf8' });
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);

if (result.status !== 0) {
  console.error('[KTC][MIGRATION] build gate failed: migration inventory is invalid');
  process.exit(result.status || 1);
}
console.log('[KTC][MIGRATION] build inventory valid; database migrations are manual and never run during build');
