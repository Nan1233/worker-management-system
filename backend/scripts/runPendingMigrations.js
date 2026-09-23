'use strict';

const IS_CF_WORKER =
  process.env.KTC_CLOUDFLARE_WORKER === 'true' ||
  Boolean(globalThis.__KTC_CLOUDFLARE_WORKER);

// This module is imported by server.js, which is bundled for Cloudflare.
// Do not import node:fs/node:path or evaluate __dirname in the Worker bundle.
if (IS_CF_WORKER) {
  module.exports = async function runPendingMigrationsInWorker() {
    return true;
  };
  return;
}

const fs = require('node:fs');
const path = require('node:path');

const MIGRATION_DIR = path.join(__dirname, '..', 'migrations');
const EXPECTED_LATEST_VERSION = 45;
const HISTORICAL_GAP_START = 8;
const HISTORICAL_GAP_END = 26;

function loadMigrationManifest() {
  if (!fs.existsSync(MIGRATION_DIR)) {
    throw new Error(`Migration directory not found: ${MIGRATION_DIR}`);
  }

  const entries = fs.readdirSync(MIGRATION_DIR)
    .filter(name => /^\d+_.+\.sql$/i.test(name))
    .map(filename => ({
      filename,
      number: Number(/^(\d+)_/.exec(filename)[1]),
      fullPath: path.join(MIGRATION_DIR, filename),
    }));

  const seen = new Set();
  for (const entry of entries) {
    if (seen.has(entry.filename)) {
      throw new Error(`Duplicate migration filename in repository: ${entry.filename}`);
    }
    seen.add(entry.filename);
  }

  entries.sort((a, b) => a.number - b.number || a.filename.localeCompare(b.filename, 'en'));

  const versions = [...new Set(entries.map(entry => entry.number))].sort((a, b) => a - b);
  const expected = Array.from({ length: EXPECTED_LATEST_VERSION }, (_, index) => index + 1);
  const missing = expected.filter(version => !versions.includes(version));
  const allowedHistoricalGap = missing.length > 0 &&
    missing.every(version => version >= HISTORICAL_GAP_START && version <= HISTORICAL_GAP_END);

  if (!entries.length || versions[0] !== 1 || versions.at(-1) !== EXPECTED_LATEST_VERSION || (missing.length && !allowedHistoricalGap)) {
    throw new Error(`Migration version inventory invalid: expected 001-045 executable range, got ${versions.join(', ')}; missing ${missing.join(', ')}`);
  }

  return { entries, versions, missingVersions: missing };
}

function splitSql(sql) {
  const statements = [];
  let start = 0;
  let quote = null;
  let lineComment = false;

  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (lineComment) {
      if (ch === '\n') lineComment = false;
      continue;
    }

    if (quote) {
      if (ch === quote && next === quote) {
        i += 1;
        continue;
      }
      if (ch === quote && sql[i - 1] !== '\\') quote = null;
      continue;
    }

    if (ch === '-' && next === '-' && (i + 2 >= sql.length || /\s/.test(sql[i + 2]))) {
      lineComment = true;
      i += 1;
      continue;
    }

    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      continue;
    }

    if (ch === ';') {
      const statement = sql.slice(start, i + 1).trim();
      if (statement) statements.push(statement);
      start = i + 1;
    }
  }

  const tail = sql.slice(start).trim();
  if (tail) statements.push(tail);
  return statements;
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function runPendingMigrations() {
  const { entries, versions, missingVersions } = loadMigrationManifest();
  const db = require('../config/db');

  const missingDb = typeof db.getMissingDatabaseVariables === 'function'
    ? db.getMissingDatabaseVariables()
    : [];

  if (missingDb.length) {
    throw new Error(`Migration database configuration missing: ${missingDb.join(', ')}`);
  }

  const connection = await db.promise().getConnection();

  try {
    await connection.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      migration_id VARCHAR(160) NOT NULL PRIMARY KEY,
      checksum CHAR(64) NOT NULL,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);

    console.log(`[KTC][MIGRATION] manifest loaded: ${entries.length} SQL files / ${versions.length} migration versions (latest 045)`);

    if (missingVersions.length) {
      const [rows] = await connection.query(
        `SELECT migration_id FROM schema_migrations
         WHERE CAST(SUBSTRING_INDEX(migration_id, '_', 1) AS UNSIGNED) BETWEEN ? AND ?
         ORDER BY migration_id`,
        [HISTORICAL_GAP_START, HISTORICAL_GAP_END],
      );

      const appliedVersions = new Set(
        rows.map(row => Number(String(row.migration_id).split('_', 1)[0])),
      );

      const missingHistorical = missingVersions.filter(version => !appliedVersions.has(version));
      if (missingHistorical.length) {
        throw new Error(
          `Historical migrations missing from both git and schema_migrations: ${missingHistorical.map(v => String(v).padStart(3, '0')).join(', ')}`,
        );
      }

      console.log('[KTC][MIGRATION] verified historical migrations 008-026 in schema_migrations');
    }

    for (const migration of entries) {
      const sql = fs.readFileSync(migration.fullPath, 'utf8');
      const checksum = await sha256(sql);

      const [existing] = await connection.query(
        'SELECT checksum FROM schema_migrations WHERE migration_id=? LIMIT 1',
        [migration.filename],
      );

      if (existing.length) {
        if (String(existing[0].checksum).toLowerCase() !== checksum.toLowerCase()) {
          throw new Error(`Migration checksum mismatch: ${migration.filename}`);
        }
        console.log(`[KTC][MIGRATION] already applied: ${migration.filename}`);
        continue;
      }

      const statements = splitSql(sql).filter(statement => {
        const normalized = statement.replace(/\s+/g, ' ').trim().toUpperCase();
        return !['START TRANSACTION;', 'BEGIN;', 'COMMIT;', 'ROLLBACK;'].includes(normalized);
      });

      console.log(`[KTC][MIGRATION] applying ${migration.filename} (${statements.length} statements)`);
      await connection.beginTransaction();

      try {
        for (const statement of statements) {
          await connection.query(statement);
        }

        await connection.query(
          'INSERT INTO schema_migrations (migration_id, checksum) VALUES (?, ?)',
          [migration.filename, checksum],
        );

        await connection.commit();
        console.log(`[KTC][MIGRATION] applied: ${migration.filename}`);
      } catch (error) {
        await connection.rollback().catch(() => undefined);
        throw new Error(`Migration failed: ${migration.filename}: ${error?.message || error}`);
      }
    }

    console.log('[KTC][MIGRATION] complete: executable migration files through 045 processed');
    return true;
  } finally {
    await connection.release();
  }
}

module.exports = runPendingMigrations;

if (require.main === module) {
  runPendingMigrations()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('[KTC][MIGRATION] fatal', error);
      process.exit(1);
    });
}
