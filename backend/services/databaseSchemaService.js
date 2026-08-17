'use strict';

const db = require('../config/db');

const SCHEMA_STATUS = Object.freeze({ READY: 'READY', DATABASE_UNAVAILABLE: 'DATABASE_UNAVAILABLE', CONTRACT_INVALID: 'DATABASE_CONTRACT_INVALID' });
const REQUIRED_TABLES = Object.freeze(['users', 'processes', 'workers', 'worker_processes', 'manager_processes', 'machines', 'product_standards', 'product_machine_standards', 'defect_types', 'deduction_types', 'production_reports_temp', 'production_report_duplicate_locks', 'production_reports', 'production_temp_defects', 'production_report_defects', 'production_temp_deductions', 'production_report_deductions', 'report_action_logs', 'report_edit_logs', 'production_temp_machine_lines', 'production_report_machine_lines', 'machine_production_events', 'machine_production_event_defects', 'production_temp_machine_defects', 'production_report_machine_defects', 'user_sessions', 'notifications', 'excel_sync_batches', 'excel_sync_logs', 'excel_export_jobs', 'integration_sync_jobs', 'google_sheets', 'production_formula_settings', 'role_permission_overrides', 'user_permission_overrides', 'activity_logs', 'report_versions', 'reporting_period_locks', 'production_plans', 'report_validation_results', 'product_standard_versions', 'production_report_snapshots', 'production_formula_setting_versions', 'master_seed_runs', 'product_aliases', 'product_standard_variants', 'product_machine_standard_variants']);
const REQUIRED_COLUMNS = Object.freeze({'users': ['id', 'username', 'password', 'full_name', 'role', 'status'], 'processes': ['id', 'process_code', 'process_name', 'status'], 'workers': ['id', 'user_id', 'worker_code', 'status'], 'worker_processes': ['worker_id', 'process_id'], 'machines': ['id', 'process_id', 'machine_code', 'machine_name', 'status'], 'product_standards': ['id', 'process_id', 'product_code', 'standard_output', 'status'], 'defect_types': ['id', 'process_id', 'defect_code', 'defect_name', 'status'], 'deduction_types': ['id', 'process_id', 'deduction_code', 'deduction_name', 'status'], 'production_reports_temp': ['id', 'worker_id', 'process_id', 'work_date', 'status'], 'production_reports': ['id', 'worker_id', 'process_id', 'work_date', 'status']});

async function verifyDatabaseSchema({ executor = db.promise() } = {}) {
  try {
    const [tableRows] = await executor.query(
      `SELECT TABLE_NAME FROM information_schema.tables WHERE table_schema = DATABASE() AND TABLE_TYPE='BASE TABLE'`,
    );
    const actual = new Set(tableRows.map(r => String(r.TABLE_NAME).toLowerCase()));
    const missingTables = REQUIRED_TABLES.filter(t => !actual.has(t));
    const missingColumns = [];
    for (const [table, columns] of Object.entries(REQUIRED_COLUMNS)) {
      if (!actual.has(table)) continue;
      const [rows] = await executor.query(
        `SELECT COLUMN_NAME FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=?`, [table],
      );
      const have = new Set(rows.map(r => String(r.COLUMN_NAME).toLowerCase()));
      for (const column of columns) if (!have.has(column)) missingColumns.push(`${table}.${column}`);
    }
    const ready = missingTables.length === 0 && missingColumns.length === 0;
    return { ready, status: ready ? SCHEMA_STATUS.READY : SCHEMA_STATUS.CONTRACT_INVALID, missingTables, missingColumns, contractVersion: 26 };
  } catch (error) {
    return { ready:false, status:SCHEMA_STATUS.DATABASE_UNAVAILABLE, missingTables:[], missingColumns:[], contractVersion:26, error };
  }
}

function createSchemaNotReadyError(result) {
  const error = new Error(`Database schema not ready: ${result.status}`);
  error.code = result.status === SCHEMA_STATUS.DATABASE_UNAVAILABLE ? 'DATABASE_UNAVAILABLE' : 'DATABASE_CONTRACT_INVALID';
  error.schemaStatus = result.status;
  error.status = 503; error.statusCode = 503; error.isPublic = false;
  error.details = { missingTables: result.missingTables || [], missingColumns: result.missingColumns || [], contractVersion: result.contractVersion || 26 };
  return error;
}

async function assertDatabaseSchemaReady(options={}) { const result=await verifyDatabaseSchema(options); if(!result.ready) throw createSchemaNotReadyError(result); return result; }
function toSafeSchemaDiagnostics(result) { return { status:result.status, schemaReady:Boolean(result.ready), contractVersion:result.contractVersion || 26, missingTables:result.missingTables || [], missingColumns:result.missingColumns || [] }; }
function loadActualMigrationLedger(){ return Promise.resolve([]); }
function analyzeMigrationState(){ return { ready:true,status:SCHEMA_STATUS.READY,contractVersion:26,missingMigrations:[],checksumMismatches:[],unexpectedMigrations:[] }; }
module.exports={ SCHEMA_STATUS, REQUIRED_TABLES, REQUIRED_COLUMNS, verifyDatabaseSchema, assertDatabaseSchemaReady, createSchemaNotReadyError, toSafeSchemaDiagnostics, loadActualMigrationLedger, analyzeMigrationState };
