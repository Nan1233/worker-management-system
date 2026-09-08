'use strict';

const db = require('../config/db');
const {
  CONTRACT_VERSION,
  getCanonicalSchema,
  compareColumn,
  compareIndex,
} = require('./canonicalSchemaContractService');

const SCHEMA_STATUS = Object.freeze({
  READY: 'READY',
  DATABASE_UNAVAILABLE: 'DATABASE_UNAVAILABLE',
  CONTRACT_INVALID: 'DATABASE_CONTRACT_INVALID',
});

const RUNTIME_REQUIRED_COLUMNS = Object.freeze({
  users: ['id', 'username', 'password', 'full_name', 'role', 'status'],
  processes: ['id', 'process_code', 'process_name', 'status'],
  workers: ['id', 'user_id', 'worker_code', 'status'],
  worker_processes: ['worker_id', 'process_id'],
  machines: ['id', 'process_id', 'machine_code', 'machine_name', 'status'],
  product_standards: ['id', 'process_id', 'product_code', 'standard_output', 'status'],
  defect_types: ['id', 'process_id', 'defect_code', 'defect_name', 'status'],
  deduction_types: ['id', 'process_id', 'deduction_code', 'deduction_name', 'status'],
  production_reports_temp: ['id', 'worker_id', 'process_id', 'work_date', 'status', 'updated_by'],
  production_reports: ['id', 'worker_id', 'process_id', 'work_date', 'status'],
  notifications: ['id', 'user_id', 'type', 'title', 'message', 'link_url', 'entity_type', 'entity_id', 'is_read', 'read_at', 'created_at'],
});

async function verifyDatabaseSchema({ executor = db.promise() } = {}) {
  try {
    const canonical = getCanonicalSchema();
    const dbName = await currentDatabase(executor);

    const [tableRows] = await executor.query(
      `SELECT TABLE_NAME
         FROM information_schema.tables
        WHERE table_schema = ?
          AND TABLE_TYPE = 'BASE TABLE'`,
      [dbName],
    );

    const actualTables = new Set(
      tableRows.map((row) => String(row.TABLE_NAME).toLowerCase()),
    );

    const expectedTables = new Set(Object.keys(canonical.tables));
    const missingTables = [...expectedTables].filter((table) => !actualTables.has(table));
    const extraTables = [...actualTables].filter((table) => !expectedTables.has(table));

    const missingColumns = [];
    const extraColumns = [];
    const invalidColumns = [];
    const missingIndexes = [];
    const invalidIndexes = [];
    const extraIndexes = [];

    for (const [table, requiredColumns] of Object.entries(RUNTIME_REQUIRED_COLUMNS)) {
      if (!actualTables.has(table)) continue;
      const [rows] = await executor.query(
        `SELECT COLUMN_NAME
           FROM information_schema.columns
          WHERE table_schema = ?
            AND table_name = ?`,
        [dbName, table],
      );
      const actual = new Set(rows.map((row) => String(row.COLUMN_NAME).toLowerCase()));
      for (const column of requiredColumns) {
        if (!actual.has(column)) missingColumns.push(`${table}.${column}`);
      }
    }

    const ready = missingTables.length === 0 && missingColumns.length === 0;

    return {
      ready,
      status: ready ? SCHEMA_STATUS.READY : SCHEMA_STATUS.CONTRACT_INVALID,
      missingTables,
      extraTables,
      missingColumns,
      invalidColumns,
      extraColumns,
      missingIndexes,
      invalidIndexes,
      extraIndexes,
      contractVersion: canonical.version,
      runtimeContract: 'MINIMUM_STRUCTURAL_V1',
    };
  } catch (error) {
    const code = String(error?.code || 'DATABASE_UNAVAILABLE');
    const reason =
      code === 'ER_ACCESS_DENIED_ERROR' || code === 'ER_DBACCESS_DENIED_ERROR'
        ? 'ACCESS_DENIED'
        : /ssl|tls|certificate/i.test(String(error?.message || ''))
          ? 'TLS_ERROR'
          : /timeout|timed out|etimedout/i.test(String(error?.message || ''))
            ? 'TIMEOUT'
            : 'CONNECTION_ERROR';

    return {
      ready: false,
      status: SCHEMA_STATUS.DATABASE_UNAVAILABLE,
      missingTables: [],
      extraTables: [],
      missingColumns: [],
      invalidColumns: [],
      extraColumns: [],
      missingIndexes: [],
      invalidIndexes: [],
      extraIndexes: [],
      contractVersion: CONTRACT_VERSION,
      runtimeContract: 'MINIMUM_STRUCTURAL_V1',
      reason,
    };
  }
}

async function currentDatabase(executor) {
  const [rows] = await executor.query('SELECT DATABASE() AS db_name');
  return String(rows?.[0]?.db_name || '').trim();
}

async function assertDatabaseSchemaReady({ executor = db.promise() } = {}) {
  const result = await verifyDatabaseSchema({ executor });
  if (!result.ready) {
    const error = new Error('DATABASE_SCHEMA_NOT_READY');
    error.code = 'DATABASE_SCHEMA_NOT_READY';
    error.schemaDiagnostics = result;
    throw error;
  }
  return result;
}

function toSafeSchemaDiagnostics(result) {
  if (!result || typeof result !== 'object') return null;
  return {
    ready: Boolean(result.ready),
    status: result.status,
    missingTables: Array.isArray(result.missingTables) ? result.missingTables : [],
    missingColumns: Array.isArray(result.missingColumns) ? result.missingColumns : [],
    contractVersion: result.contractVersion || CONTRACT_VERSION,
    runtimeContract: result.runtimeContract || 'MINIMUM_STRUCTURAL_V1',
    reason: result.reason || null,
  };
}

module.exports = {
  SCHEMA_STATUS,
  verifyDatabaseSchema,
  assertDatabaseSchemaReady,
  toSafeSchemaDiagnostics,
};
