'use strict';

const db = require('../config/db');

// TEST intentionally runs only the canonical GC worker replacement migration.
// The SQL is fetched from the same branch that is deployed to Cloudflare so
// the runner cannot silently execute an older/nonexistent pinned commit.
const MIGRATION_FILES = ['045_gc_worker_canonical_slug_20260923.sql'];
const RAW_BASE = 'https://raw.githubusercontent.com/Nan1233/worker-management-system/test/backend/migrations/';
let runnerPromise = null;

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

function splitSql(sql) {
  const out = [];
  let start = 0;
  let quote = null;
  let lineComment = false;
  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (lineComment) { if (ch === '\n') lineComment = false; continue; }
    if (quote) {
      if (ch === quote && next === quote) { i += 1; continue; }
      if (ch === quote && sql[i - 1] !== '\\') quote = null;
      continue;
    }
    if (ch === '-' && next === '-' && (i + 2 >= sql.length || /\s/.test(sql[i + 2]))) { lineComment = true; i += 1; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === ';') { const s = sql.slice(start, i + 1).trim(); if (s) out.push(s); start = i + 1; }
  }
  const tail = sql.slice(start).trim();
  if (tail) out.push(tail);
  return out;
}

async function runPendingMigrations() {
  if (runnerPromise) return runnerPromise;
  runnerPromise = (async () => {
    const connection = await db.promise().getConnection();
    try {
      await connection.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
        migration_id VARCHAR(160) NOT NULL PRIMARY KEY,
        checksum CHAR(64) NOT NULL,
        applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`);

      for (const filename of MIGRATION_FILES) {
        const response = await fetch(`${RAW_BASE}${encodeURIComponent(filename)}`);
        if (!response.ok) throw new Error(`Cannot fetch ${filename}: HTTP ${response.status}`);
        const sql = await response.text();
        const checksum = await sha256(sql);
        const [existing] = await connection.query(
          'SELECT checksum FROM schema_migrations WHERE migration_id=? LIMIT 1', [filename]
        );
        if (existing.length) {
          if (String(existing[0].checksum).toLowerCase() !== checksum.toLowerCase()) {
            throw new Error(`Migration checksum mismatch: ${filename}`);
          }
          console.log(`[KTC][MIGRATION] already applied: ${filename}`);
          continue;
        }

        // Migration files must contain SQL statements only. The runner owns the
        // transaction so BEGIN/COMMIT inside a migration cannot break TiDB.
        const statements = splitSql(sql).filter(statement => {
          const normalized = statement.replace(/\s+/g, ' ').trim().toUpperCase();
          return normalized !== 'START TRANSACTION;' && normalized !== 'BEGIN;' && normalized !== 'COMMIT;' && normalized !== 'ROLLBACK;';
        });
        console.log(`[KTC][MIGRATION] applying ${filename} (${statements.length} statements)`);
        await connection.beginTransaction();
        try {
          for (const statement of statements) await connection.query(statement);
          await connection.query(
            'INSERT INTO schema_migrations (migration_id, checksum) VALUES (?, ?)',
            [filename, checksum]
          );
          await connection.commit();
        } catch (error) {
          await connection.rollback().catch(() => undefined);
          throw new Error(`Migration failed: ${filename}: ${error?.message || error}`);
        }
        console.log(`[KTC][MIGRATION] applied: ${filename}`);
      }
      return true;
    } finally {
      await connection.release();
    }
  })().catch(error => { runnerPromise = null; console.error('[KTC][MIGRATION] fatal', error); throw error; });
  return runnerPromise;
}

module.exports = runPendingMigrations;
if (require.main === module) runPendingMigrations().then(() => process.exit(0)).catch(() => process.exit(1));
