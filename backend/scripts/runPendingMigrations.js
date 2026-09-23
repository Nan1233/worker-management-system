'use strict';

const db = require('../config/db');

// This runner is intentionally filename-based. Numeric prefixes are only
// ordering hints; duplicate prefixes already exist in this repository.
const MIGRATION_FILES = [
  '031_mai_standard_data_20260903.sql',
  '032_add_2801_lt_long_machine_20260908.sql',
  '032_gc_xoay_defect_20260904.sql',
  '033_gc_xoay_master_repair_20260904.sql',
  '033_map_2801_lt_to_gc_long_machine_11_20260909.sql',
  '034_map_2801_lt_to_all_gc_long_machines_20260909.sql',
  '034_non_product_work_process_20260907.sql',
  '035_gc_late_early_deduction_20260907.sql',
  '035_sync_canonical_gia_cong_worker_process_assignments_20260908.sql',
  '036_notifications_runtime_columns_20260908.sql',
  '037_production_reports_logical_duplicate_key_20260909.sql',
  '038_gc_deduction_types_exact_20260910.sql',
  '039_cvk_deduction_types_20260911.sql',
  '039_machine_adjustment_fields_20260914.sql',
  '039_replace_gc_workers_20260922.sql',
  '040_cvk_deduction_types_repair_20260914.sql',
  '040_gc_defect_types_exact_20260911.sql',
  '040_gc_standard_data_20260922.sql',
  '041_sync_gc_cut_long_from_ma_hoa_xlsx_20260922.sql',
  '042_gc_worker_master_20260923.sql',
  '043_gc_standard_master_20260923.sql',
  '044_gc_canonical_master_repair_20260923.sql',
].sort((a, b) => a.localeCompare(b, 'en'));

// Pin the source for the test Worker so a moving branch cannot silently
// change a migration while it is being applied. This commit contains 044.
const PINNED_SOURCE_COMMIT = '2fbe2901c0b23b09e75bc45345192e44d0555931';
const RAW_BASE = `https://raw.githubusercontent.com/Nan1233/worker-management-system/${PINNED_SOURCE_COMMIT}/backend/migrations/`;

let runnerPromise = null;

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function splitSqlStatements(sql) {
  const statements = [];
  let start = 0;
  let quote = null;
  let lineComment = false;
  let blockComment = false;
  let escaped = false;

  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (lineComment) {
      if (ch === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (ch === '*' && next === '/') {
        blockComment = false;
        i += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === quote) {
        if (next === quote) {
          i += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }

    if (ch === '-' && next === '-' && (i + 2 >= sql.length || /\s/.test(sql[i + 2]))) {
      lineComment = true;
      i += 1;
      continue;
    }
    if (ch === '#') {
      lineComment = true;
      continue;
    }
    if (ch === '/' && next === '*') {
      blockComment = true;
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

function isTransactionStatement(statement) {
  return /^(?:\/\*[\s\S]*?\*\/\s*)?(?:--[^\n]*\n\s*)*(?:START\s+TRANSACTION|BEGIN\b)/i.test(statement);
}

async function readMigration(filename) {
  const response = await fetch(`${RAW_BASE}${encodeURIComponent(filename)}`);
  if (!response.ok) {
    throw new Error(`Không tải được migration ${filename}: HTTP ${response.status}`);
  }
  return response.text();
}

async function query(connection, sql, params = []) {
  const [rows] = await connection.query(sql, params);
  return rows;
}

async function ensureMigrationTable(connection) {
  await query(connection, `
    CREATE TABLE IF NOT EXISTS schema_migrations (
      migration_id VARCHAR(160) NOT NULL PRIMARY KEY,
      checksum CHAR(64) NOT NULL,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function runOneMigration(connection, filename, sql) {
  const checksum = await sha256(sql);
  const existing = await query(
    connection,
    'SELECT migration_id, checksum FROM schema_migrations WHERE migration_id = ? LIMIT 1',
    [filename],
  );

  if (existing.length) {
    if (String(existing[0].checksum).toLowerCase() !== checksum.toLowerCase()) {
      throw new Error(`Migration checksum mismatch: ${filename}`);
    }
    console.log(`[KTC][MIGRATION] already applied: ${filename}`);
    return false;
  }

  const statements = splitSqlStatements(sql)
    .map((statement) => statement.trim())
    .filter(Boolean);

  if (!statements.length) {
    throw new Error(`Migration rỗng: ${filename}`);
  }

  console.log(`[KTC][MIGRATION] applying ${filename} (${statements.length} statements)`);

  let sawExplicitTransaction = false;
  try {
    for (const statement of statements) {
      if (isTransactionStatement(statement)) sawExplicitTransaction = true;
      await query(connection, statement);
    }

    await query(
      connection,
      'INSERT INTO schema_migrations (migration_id, checksum) VALUES (?, ?)',
      [filename, checksum],
    );

    console.log(`[KTC][MIGRATION] applied: ${filename}`);
    return true;
  } catch (error) {
    if (sawExplicitTransaction) {
      try { await query(connection, 'ROLLBACK'); } catch (_) {}
    }
    throw new Error(`Migration failed: ${filename}: ${error?.message || error}`);
  }
}

async function runPendingMigrations() {
  if (runnerPromise) return runnerPromise;

  runnerPromise = (async () => {
    const connection = await db.promise().getConnection();
    try {
      await ensureMigrationTable(connection);

      for (const filename of MIGRATION_FILES) {
        const sql = await readMigration(filename);
        await runOneMigration(connection, filename, sql);
      }

      const [latest] = await query(
        connection,
        'SELECT migration_id, applied_at FROM schema_migrations ORDER BY applied_at DESC, migration_id DESC LIMIT 1',
      );
      console.log(`[KTC][MIGRATION] ready latest=${latest?.migration_id || 'none'}`);
      return true;
    } finally {
      await connection.release();
    }
  })().catch((error) => {
    runnerPromise = null;
    console.error('[KTC][MIGRATION] fatal', error);
    throw error;
  });

  return runnerPromise;
}

module.exports = runPendingMigrations;

if (require.main === module) {
  runPendingMigrations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
