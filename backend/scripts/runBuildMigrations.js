'use strict';

// Cloudflare Workers Builds inject WORKERS_CI and WORKERS_CI_BRANCH.
// This script is a build-time gate only by default. Database migrations are
// opt-in so a deploy cannot hang while waiting on a TiDB connection.
if (String(process.env.WORKERS_CI || '') !== '1' || String(process.env.WORKERS_CI_BRANCH || '') !== 'test') {
  console.log('[KTC][MIGRATION] build gate skip: not a Cloudflare Workers test build');
  process.exit(0);
}

const fs = require('node:fs');
const path = require('node:path');

const MIGRATION_DIR = path.join(__dirname, '..', 'migrations');
const EXPECTED_LATEST_VERSION = 45;
const HISTORICAL_GAP_START = 8;
const HISTORICAL_GAP_END = 26;

function validateMigrationInventory() {
  if (!fs.existsSync(MIGRATION_DIR)) {
    throw new Error(`Migration directory not found: ${MIGRATION_DIR}`);
  }

  const entries = fs.readdirSync(MIGRATION_DIR)
    .filter((name) => /^\d+_.+\.sql$/i.test(name))
    .map((filename) => {
      const match = /^(\d+)_/.exec(filename);
      return { filename, number: Number(match[1]) };
    });

  const seenNames = new Set();
  for (const entry of entries) {
    if (seenNames.has(entry.filename)) {
      throw new Error(`Duplicate migration filename in repository: ${entry.filename}`);
    }
    seenNames.add(entry.filename);
  }

  entries.sort((a, b) => a.number - b.number || a.filename.localeCompare(b.filename, 'en'));
  const versions = [...new Set(entries.map((item) => item.number))].sort((a, b) => a - b);
  const expectedVersions = Array.from({ length: EXPECTED_LATEST_VERSION }, (_, i) => i + 1);
  const missingVersions = expectedVersions.filter((version) => !versions.includes(version));
  const allowedHistoricalGap = missingVersions.length > 0 && missingVersions.every(
    (version) => version >= HISTORICAL_GAP_START && version <= HISTORICAL_GAP_END,
  );

  if (
    !entries.length ||
    versions[0] !== 1 ||
    versions.at(-1) !== EXPECTED_LATEST_VERSION ||
    (missingVersions.length && !allowedHistoricalGap)
  ) {
    throw new Error(
      `Migration version inventory invalid: expected versions 001-045, got ${versions.join(', ')}`,
    );
  }

  return { entries, versions, missingVersions };
}

async function main() {
  const { entries, versions, missingVersions } = validateMigrationInventory();
  console.log(
    `[KTC][MIGRATION] build inventory valid: ${entries.length} SQL files / versions ${versions[0]}-${versions.at(-1)}`,
  );

  if (missingVersions.length) {
    console.log(
      `[KTC][MIGRATION] historical gap ${String(HISTORICAL_GAP_START).padStart(3, '0')}-${String(HISTORICAL_GAP_END).padStart(3, '0')} is allowed; existing test DB must contain those historical entries in schema_migrations.`,
    );
  }

  // Never mutate a database during a normal Cloudflare build. This avoids
  // hanging deployments when TiDB is unavailable or a build has no DB vars.
  // A dedicated test build may opt in explicitly after DB variables are set.
  const runDatabaseMigration = String(process.env.KTC_RUN_BUILD_DB_MIGRATIONS || '').toLowerCase() === 'true';
  if (!runDatabaseMigration) {
    console.log('[KTC][MIGRATION] database migration deferred: KTC_RUN_BUILD_DB_MIGRATIONS is not true');
    return;
  }

  const db = require('../config/db');
  const missingDbVariables = typeof db.getMissingDatabaseVariables === 'function'
    ? db.getMissingDatabaseVariables()
    : [];

  if (missingDbVariables.length) {
    throw new Error(
      `Build DB migration requested but database configuration is missing: ${missingDbVariables.join(', ')}`,
    );
  }

  const runPendingMigrations = require('./runPendingMigrations');
  await runPendingMigrations();
  console.log('[KTC][MIGRATION] test build database migrations completed');
}

main().catch((error) => {
  console.error('[KTC][MIGRATION] test build migration gate failed:', error?.message || error);
  process.exit(1);
});
