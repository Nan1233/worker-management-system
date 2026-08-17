'use strict';

/**
 * KTC DATABASE CONTRACT
 * ---------------------
 * The production database is restored from the canonical full SQL snapshot.
 * Runtime never reads or executes migrations and never uses schema_migrations.
 *
 * The contract intentionally checks the physical schema + critical columns.
 * This prevents a half-restored database from being accepted while avoiding
 * the old "MIGRATIONS_PENDING" startup gate.
 */

const REQUIRED_TABLES = Object.freeze([
  'users',
  'workers',
  'worker_processes',
  'manager_processes',
  'processes',
  'machines',
  'product_aliases',
  'product_standards',
  'product_standard_versions',
  'product_standard_variants',
  'product_machine_standards',
  'product_machine_standard_variants',
  'defect_types',
  'deduction_types',
  'production_reports_temp',
  'production_reports',
  'production_temp_defects',
  'production_temp_deductions',
  'production_temp_machine_lines',
  'production_temp_machine_defects',
  'production_report_defects',
  'production_report_deductions',
  'production_report_machine_lines',
  'production_report_machine_defects',
  'production_report_snapshots',
  'production_report_duplicate_locks',
  'machine_production_events',
  'machine_production_event_defects',
  'excel_export_jobs',
  'excel_sync_batches',
  'excel_sync_logs',
  'google_sheets',
  'integration_sync_jobs',
  'notifications',
  'activity_logs',
  'report_action_logs',
  'report_edit_logs',
  'report_validation_results',
  'report_versions',
  'reporting_period_locks',
  'role_permission_overrides',
  'user_permission_overrides',
  'user_sessions',
  'production_formula_settings',
  'production_formula_setting_versions',
  'production_plans',
  'master_seed_runs',
  'master_personnel_source',
  'worker_code_aliases',
  'master_product_source',
  'audit_logs'
]);

const REQUIRED_COLUMNS = Object.freeze({
  users: ['id', 'username', 'password', 'role', 'status'],
  workers: ['id', 'user_id', 'worker_code', 'status'],
  worker_processes: ['worker_id', 'process_id'],
  processes: ['id', 'process_code', 'process_name', 'status'],
  machines: ['id', 'process_id', 'machine_code', 'machine_name', 'max_workers_per_machine', 'output_basis', 'status'],
  product_standards: ['id', 'process_id', 'product_code', 'standard_output', 'status'],
  product_machine_standards: ['id', 'process_id', 'product_code', 'machine_id', 'standard_output', 'is_active'],
  defect_types: ['id', 'process_id', 'defect_code', 'defect_name', 'status'],
  deduction_types: ['id', 'process_id', 'deduction_code', 'deduction_name', 'status'],
  production_reports_temp: ['id', 'worker_id', 'process_id', 'work_date', 'total_time', 'actual_time', 'deduction_time', 'status'],
  production_reports: ['id', 'worker_id', 'process_id', 'work_date', 'total_time', 'actual_time', 'deduction_time', 'status'],
  production_temp_defects: ['id', 'production_temp_id'],
  production_temp_deductions: ['id', 'production_temp_id'],
  production_report_defects: ['id', 'report_id'],
  production_report_deductions: ['id', 'report_id'],
  user_sessions: ['id', 'user_id', 'refresh_token_hash', 'expires_at'],
  master_personnel_source: ['id', 'source_sha256', 'process_code', 'source_worker_code', 'source_name'],
  worker_code_aliases: ['id', 'alias_code', 'worker_id'],
  master_product_source: ['id', 'source_sha256', 'process_code', 'alias_code', 'product_code']
});

const SCHEMA_STATUS = Object.freeze({
  READY: 'READY',
  DATABASE_CONTRACT_INVALID: 'DATABASE_CONTRACT_INVALID',
  DATABASE_UNAVAILABLE: 'DATABASE_UNAVAILABLE'
});

function defaultExecutor() {
  return require('../config/db').promise();
}

async function listTables(executor) {
  const [rows] = await executor.query(
    `SELECT TABLE_NAME AS table_name
       FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_type = 'BASE TABLE'`
  );
  return rows.map((row) => String(row.table_name));
}

async function listColumns(executor) {
  const [rows] = await executor.query(
    `SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name
       FROM information_schema.columns
      WHERE table_schema = DATABASE()`
  );
  return rows;
}

async function verifyDatabaseSchema({ executor = defaultExecutor() } = {}) {
  try {
    const [tableNames, columns] = await Promise.all([
      listTables(executor),
      listColumns(executor)
    ]);

    const tableSet = new Set(tableNames);
    const missingTables = REQUIRED_TABLES.filter((name) => !tableSet.has(name));

    const columnsByTable = new Map();
    for (const row of columns) {
      const table = String(row.table_name);
      if (!columnsByTable.has(table)) columnsByTable.set(table, new Set());
      columnsByTable.get(table).add(String(row.column_name));
    }

    const missingColumns = [];
    for (const [table, required] of Object.entries(REQUIRED_COLUMNS)) {
      const actual = columnsByTable.get(table) || new Set();
      for (const column of required) {
        if (!actual.has(column)) {
          missingColumns.push({ table, column });
        }
      }
    }

    const ready = missingTables.length === 0 && missingColumns.length === 0;

    return {
      ready,
      status: ready ? SCHEMA_STATUS.READY : SCHEMA_STATUS.DATABASE_CONTRACT_INVALID,
      databaseSource: 'FULL_DATABASE_SNAPSHOT',
      missingTables,
      missingColumns,
      expectedMigration: null,
      actualMigration: null
    };
  } catch (error) {
    return {
      ready: false,
      status: SCHEMA_STATUS.DATABASE_UNAVAILABLE,
      databaseSource: 'FULL_DATABASE_SNAPSHOT',
      missingTables: [],
      missingColumns: [],
      expectedMigration: null,
      actualMigration: null,
      error
    };
  }
}

function createSchemaNotReadyError(result) {
  const error = new Error(
    result.status === SCHEMA_STATUS.DATABASE_CONTRACT_INVALID
      ? 'Database contract không khớp full database chuẩn'
      : 'Không thể kiểm tra database contract'
  );
  error.code = result.status === SCHEMA_STATUS.DATABASE_CONTRACT_INVALID
    ? 'DATABASE_CONTRACT_INVALID'
    : 'DATABASE_UNAVAILABLE';
  error.schemaStatus = result.status;
  error.status = 503;
  error.statusCode = 503;
  error.isPublic = false;
  error.details = {
    databaseSource: result.databaseSource,
    missingTables: result.missingTables || [],
    missingColumns: result.missingColumns || []
  };
  return error;
}

async function assertDatabaseSchemaReady(options = {}) {
  const result = await verifyDatabaseSchema(options);
  if (!result.ready) throw createSchemaNotReadyError(result);
  return result;
}

function toSafeSchemaDiagnostics(result) {
  return {
    status: result.status,
    schemaReady: Boolean(result.ready),
    databaseSource: result.databaseSource || 'FULL_DATABASE_SNAPSHOT',
    expectedMigration: null,
    actualMigration: null,
    missingTables: result.missingTables || [],
    missingColumns: result.missingColumns || []
  };
}

function isMissingMigrationTableError(error) {
  return error?.code === 'ER_NO_SUCH_TABLE'
    || error?.errno === 1146
    || /schema_migrations/i.test(String(error?.message || ''));
}

async function loadActualMigrationLedger() {
  return [];
}

function analyzeMigrationState() {
  return {
    ready: true,
    status: SCHEMA_STATUS.READY,
    databaseSource: 'FULL_DATABASE_SNAPSHOT',
    expectedLatest: null,
    actualLatest: null,
    missingMigrations: [],
    checksumMismatches: [],
    unexpectedMigrations: []
  };
}

module.exports = {
  SCHEMA_STATUS,
  REQUIRED_TABLES,
  REQUIRED_COLUMNS,
  analyzeMigrationState,
  loadActualMigrationLedger,
  verifyDatabaseSchema,
  assertDatabaseSchemaReady,
  createSchemaNotReadyError,
  toSafeSchemaDiagnostics,
  isMissingMigrationTableError
};
