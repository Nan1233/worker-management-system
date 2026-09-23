'use strict';

// Workers Builds inject WORKERS_CI and WORKERS_CI_BRANCH into the build
// environment. Only the test branch is allowed to mutate the test TiDB DB.
if (String(process.env.WORKERS_CI || '') !== '1' || String(process.env.WORKERS_CI_BRANCH || '') !== 'test') {
  console.log('[KTC][MIGRATION] postinstall skip: not a Cloudflare Workers test build');
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

  const files = fs.readdirSync(MIGRATION_DIR)
    .filter((name) => /^\d+_.+\.sql$/i.test(name));
  const seenNames = new Set();
  const entries = [];

  for (const filename of files) {
    if (seenNames.has(filename)) {
      throw new Error(`Duplicate migration filename in repository: ${filename}`);
    }
    seenNames.add(filename);
    const match = /^(\d+)_/.exec(filename);
    entries.push({ filename, number: Number(match[1]) });
  }

  entries.sort((a, b) => a.number - b.number || a.filename.localeCompare(b.filename, 'en'));
  const versions = [...new Set(entries.map((item) => item.number))].sort((a, b) => a - b);
  const expectedVersions = Array.from({ length: EXPECTED_LATEST_VERSION }, (_, i) => i + 1);
  const missingVersions = expectedVersions.filter((version) => !versions.includes(version));
  const allowedHistoricalGap = missingVersions.length > 0 && missingVersions.every(
    (version) => version >= HISTORICAL_GAP_START && version <= HISTORICAL_GAP_END,
  );

  if (!entries.length || versions[0] !== 1 || versions.at(-1) !== EXPECTED_LATEST_VERSION || (missingVersions.length && !allowedHistoricalGap)) {
    throw new Error(
      `Migration version inventory invalid: expected versions 001-045, got ${versions.join(', ')}`,
    );
  }

  return { entries, versions, missingVersions };
}

async function main() {
  const { entries, versions, missingVersions } = validateMigrationInventory();
  console.log(`[KTC][MIGRATION] build inventory valid: ${entries.length} SQL files / versions ${versions[0]}-${versions.at(-1)}`);

  // Cloudflare Builds do not automatically receive Worker runtime secrets.
  // Do not fail the deployment merely because DB_HOST/DB_USER/... are absent.
  // When DB variables are present, execute the real migration runner here.
  const db = require('../config/db');
  const missingDbVariables = typeof db.getMissingDatabaseVariables === 'function'
    ? db.getMissingDatabaseVariables()
    : [];

  if (missingDbVariables.length) {
    console.warn(
      `[KTC][MIGRATION] build DB migration deferred: missing ${missingDbVariables.join(', ')}. ` +
      'Inventory is valid; configure the test build DB variables to execute SQL migrations during build.',
    );
    if (missingVersions.length) {
      console.warn('[KTC][MIGRATION] historical gap 008-026 is expected to be represented by schema_migrations in the existing test DB.');
    }
    return;
  }

  const runPendingMigrations = require('./runPendingMigrations');
  await runPendingMigrations();
  console.log('[KTC][MIGRATION] test build migration gate passed and database migrations are up to date');
}

main().catch((error) => {
  console.error('[KTC][MIGRATION] test build migration gate failed:', error?.message || error);
  process.exit(1);
});
