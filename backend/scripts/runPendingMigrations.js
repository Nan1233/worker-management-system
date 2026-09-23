'use strict';

const path = require('node:path');
const fs = require('node:fs');

const isCloudflareWorker =
  process.env.KTC_CLOUDFLARE_WORKER === 'true' ||
  Boolean(globalThis.__KTC_CLOUDFLARE_WORKER);

// Canonical migration source: backend/migrations only.
// backend/database contains the full-schema SQL snapshot, not executable
// migration files. Keeping a single source prevents duplicate migration IDs
// from being discovered during Cloudflare builds.
const MIGRATION_DIR = path.join(__dirname, '..', 'migrations');

function loadMigrationManifest() {
  const entries = [];
  const seen = new Set();

  if (!fs.existsSync(MIGRATION_DIR)) {
    throw new Error(`Migration directory not found: ${MIGRATION_DIR}`);
  }

  for (const filename of fs.readdirSync(MIGRATION_DIR).filter(name => /^\d+_.+\.sql$/i.test(name))) {
    if (seen.has(filename)) {
      throw new Error(`Duplicate migration filename in repository: ${filename}`);
    }
    seen.add(filename);
    const fullPath = path.join(MIGRATION_DIR, filename);
    const match = /^(\d+)_/.exec(filename);
    entries.push({ filename, number: Number(match[1]), fullPath });
  }

  entries.sort((a, b) => a.number - b.number || a.filename.localeCompare(b.filename, 'en'));
  const versions = [...new Set(entries.map(item => item.number))].sort((a, b) => a - b);

  if (!entries.length) {
    throw new Error('No SQL migration files found in backend/migrations');
  }
  if (versions[0] !== 1 || versions.at(-1) !== 45 || versions.length !== 45) {
    throw new Error(`Migration version inventory invalid: expected versions 001-045, got ${versions.join(', ')}`);
  }

  return { entries, versions };
}

function splitSql(sql) {
  const out = [];
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
      if (statement) out.push(statement);
      start = i + 1;
    }
  }

  const tail = sql.slice(start).trim();
  if (tail) out.push(tail);

  return out;
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(
    new Uint8Array(digest),
    b => b.toString(16).padStart(2, '0'),
  ).join('');
}

async function runPendingMigrations() {
  // Cloudflare Worker imports this module through server.js, but migration
  // execution happens only in a build environment via runBuildMigrations.js.
  if (isCloudflareWorker) {
    return true;
  }

  const { entries, versions } = loadMigrationManifest();
  const db = require('../config/db');

  const missing =
    typeof db.getMissingDatabaseVariables === 'function'
      ? db.getMissingDatabaseVariables()
      : [];

  if (missing.length) {
    throw new Error(
      `Migration database configuration missing: ${missing.join(', ')}. Configure TiDB variables for the test build.`,
    );
  }

  const connection = await db.promise().getConnection();

  try {
    await connection.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      migration_id VARCHAR(160) NOT NULL PRIMARY KEY,
      checksum CHAR(64) NOT NULL,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);

    console.log(
      `[KTC][MIGRATION] manifest loaded: ${entries.length} SQL files / ${versions.length} migration versions (001-045)`,
    );

    for (const migration of entries) {
      const { filename, fullPath } = migration;
      const sql = fs.readFileSync(fullPath, 'utf8');
      const checksum = await sha256(sql);

      const [existing] = await connection.query(
        'SELECT checksum FROM schema_migrations WHERE migration_id=? LIMIT 1',
        [filename],
      );

      if (existing.length) {
        if (String(existing[0].checksum).toLowerCase() !== checksum.toLowerCase()) {
          throw new Error(`Migration checksum mismatch: ${filename}`);
        }
        console.log(`[KTC][MIGRATION] already applied: ${filename}`);
        continue;
      }

      const statements = splitSql(sql).filter(statement => {
        const normalized = statement.replace(/\s+/g, ' ').trim().toUpperCase();
        return !['START TRANSACTION;', 'BEGIN;', 'COMMIT;', 'ROLLBACK;'].includes(normalized);
      });

      console.log(`[KTC][MIGRATION] applying ${filename} (${statements.length} statements)`);
      await connection.beginTransaction();

      try {
        for (const statement of statements) {
          await connection.query(statement);
        }

        await connection.query(
          'INSERT INTO schema_migrations (migration_id, checksum) VALUES (?, ?)',
          [filename, checksum],
        );

        await connection.commit();
        console.log(`[KTC][MIGRATION] applied: ${filename}`);
      } catch (error) {
        await connection.rollback().catch(() => undefined);
        throw new Error(
          `Migration failed: ${filename}: ${error?.message || error}`,
        );
      }
    }

    console.log('[KTC][MIGRATION] complete: all migration versions 001-045 processed');
    return true;
  } finally {
    connection.release();
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
