'use strict';

const db = require('../config/db');

const LEGACY_BASE = 'https://raw.githubusercontent.com/Nan1233/worker-management-system/0dae818f5d59c9debfc2052b70ad637733778df9/backend/migrations/';
const DATABASE_MIGRATION_BASE = 'https://raw.githubusercontent.com/Nan1233/worker-management-system/test/backend/database/migrations/';
const CURRENT_MIGRATION_BASE = 'https://raw.githubusercontent.com/Nan1233/worker-management-system/test/backend/migrations/';

// 001-026 are the original canonical schema migrations. Their exact SQL is
// preserved at an immutable commit because the old release refactor removed
// those files from the active migration directory. Never invent or regenerate
// these migrations: the DB ledger already identifies them by these filenames.
const LEGACY_MIGRATIONS = [
  '001_core_master_schema.sql', '002_production_schema.sql',
  '003_machine_and_session_schema.sql', '004_sync_and_export_schema.sql',
  '005_entry_date_compatibility.sql', '006_extra_data_compatibility.sql',
  '007_production_formula_settings.sql', '008_client_request_idempotency.sql',
  '009_role_permissions.sql', '010_audit_governance_demo.sql',
  '011_master_seed_support.sql', '012_factory_machine_rules_20260810.sql',
  '013_book2_machine_product_time_20260810.sql', '014_user_sessions_login_compat_20260810.sql',
  '015_latest_excel_source_sync_20260810.sql', '016_integrity_constraints_20260810.sql',
  '017_integration_sync_job_runtime_contract_20260812.sql', '018_gc_shared_machine_max_workers_20260812.sql',
  '019_historical_standard_snapshot_20260812.sql', '020_training_percent_snapshot_20260812.sql',
  '021_kqd_policy_snapshot_20260812.sql', '022_shared_machine_accounting_20260812.sql',
  '023_refresh_session_rotation_20260813.sql', '024_logical_duplicate_report_lock_20260813.sql',
  '025_formula_settings_effective_range_20260813.sql', '026_master_data_excel_reconciliation_20260817.sql',
];

const DATABASE_MIGRATIONS = [
  '027_notifications_runtime_columns.sql', '028_report_edit_proposals.sql',
  '029_temp_report_updated_by.sql', '030_report_kpi_calculated_columns.sql',
];

// Files currently present on branch test. Duplicate numeric prefixes are
// intentional and are ordered lexicographically within the same version.
const CURRENT_MIGRATIONS = [
  '031_mai_standard_data_20260903.sql',
  '032_add_2801_lt_long_machine_20260908.sql', '032_gc_xoay_defect_20260904.sql',
  '033_gc_xoay_master_repair_20260904.sql', '033_map_2801_lt_to_gc_long_machine_11_20260909.sql',
  '034_map_2801_lt_to_all_gc_long_machines_20260909.sql', '034_non_product_work_process_20260907.sql',
  '035_gc_late_early_deduction_20260907.sql', '035_sync_canonical_gia_cong_worker_process_assignments_20260908.sql',
  '036_notifications_runtime_columns_20260908.sql', '037_production_reports_logical_duplicate_key_20260909.sql',
  '038_gc_deduction_types_exact_20260910.sql', '039_cvk_deduction_types_20260911.sql',
  '039_machine_adjustment_fields_20260914.sql', '039_replace_gc_workers_20260922.sql',
  '040_cvk_deduction_types_repair_20260914.sql', '040_gc_defect_types_exact_20260911.sql',
  '040_gc_standard_data_20260922.sql', '041_sync_gc_cut_long_from_ma_hoa_xlsx_20260922.sql',
  '042_gc_worker_master_20260923.sql', '043_gc_standard_master_20260923.sql',
  '044_gc_canonical_master_repair_20260923.sql', '045_gc_worker_canonical_slug_20260923.sql',
];

const MIGRATIONS = [
  ...LEGACY_MIGRATIONS.map(filename => ({ filename, base: LEGACY_BASE })),
  ...DATABASE_MIGRATIONS.map(filename => ({ filename, base: DATABASE_MIGRATION_BASE })),
  ...CURRENT_MIGRATIONS.map(filename => ({ filename, base: CURRENT_MIGRATION_BASE })),
].sort((a, b) => Number.parseInt(a.filename, 10) - Number.parseInt(b.filename, 10) || a.filename.localeCompare(b.filename));

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
    if (ch === ';') { const statement = sql.slice(start, i + 1).trim(); if (statement) out.push(statement); start = i + 1; }
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

      console.log(`[KTC][MIGRATION] manifest loaded: ${MIGRATIONS.length} migration files`);

      for (const migration of MIGRATIONS) {
        const { filename, base } = migration;
        const response = await fetch(`${base}${encodeURIComponent(filename)}`);
        if (!response.ok) throw new Error(`Cannot fetch ${filename}: HTTP ${response.status}`);
        const sql = await response.text();
        const checksum = await sha256(sql);
        const [existing] = await connection.query('SELECT checksum FROM schema_migrations WHERE migration_id=? LIMIT 1', [filename]);

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
          for (const statement of statements) await connection.query(statement);
          await connection.query('INSERT INTO schema_migrations (migration_id, checksum) VALUES (?, ?)', [filename, checksum]);
          await connection.commit();
          console.log(`[KTC][MIGRATION] applied: ${filename}`);
        } catch (error) {
          await connection.rollback().catch(() => undefined);
          throw new Error(`Migration failed: ${filename}: ${error?.message || error}`);
        }
      }

      console.log('[KTC][MIGRATION] complete: all 001-045 sources processed');
      return true;
    } finally {
      await connection.release();
    }
  })().catch(error => { runnerPromise = null; console.error('[KTC][MIGRATION] fatal', error); throw error; });
  return runnerPromise;
}

module.exports = runPendingMigrations;
if (require.main === module) runPendingMigrations().then(() => process.exit(0)).catch(() => process.exit(1));
