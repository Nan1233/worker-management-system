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

    // Runtime readiness intentionally uses the long-standing minimum structural
    // contract. The full canonical SQL remains an audit/source-of-truth artifact;
    // it must not force production DB rewrites during a demo. This is especially
    // important for existing TiDB databases that contain legacy migration-era
    // objects or harmless type/index drift.
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

    // Keep these arrays for diagnostics/API compatibility. They are intentionally
    // non-blocking in runtime mode; strict canonical verification is available via
    // the canonical contract tests and can be run separately after production.
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
      error,
      reason,
    };
  }
}

async function currentDatabase(executor) {
  const [rows] = await executor.query('SELECT DATABASE() AS db_name');
  const dbName = rows[0]?.db_name;
  if (!dbName) {
    const error = new Error('No active database selected');
    error.code = 'DATABASE_UNAVAILABLE';
    throw error;
  }
  return dbName;
}

function createSchemaNotReadyError(result) {
  const error = new Error(`Database schema not ready: ${result.status}`);
  error.code =
    result.status === SCHEMA_STATUS.DATABASE_UNAVAILABLE
      ? 'DATABASE_UNAVAILABLE'
      : 'DATABASE_CONTRACT_INVALID';
  error.schemaStatus = result.status;
  error.status = 503;
  error.statusCode = 503;
  error.isPublic = false;
  error.details = {
    missingTables: result.missingTables || [],
    extraTables: result.extraTables || [],
    missingColumns: result.missingColumns || [],
    invalidColumns: result.invalidColumns || [],
    extraColumns: result.extraColumns || [],
    missingIndexes: result.missingIndexes || [],
    invalidIndexes: result.invalidIndexes || [],
    extraIndexes: result.extraIndexes || [],
    contractVersion: result.contractVersion || CONTRACT_VERSION,
    runtimeContract: result.runtimeContract || 'MINIMUM_STRUCTURAL_V1',
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
    contractVersion: result.contractVersion || CONTRACT_VERSION,
    runtimeContract: result.runtimeContract || 'MINIMUM_STRUCTURAL_V1',
    missingTables: result.missingTables || [],
    invalidColumns: result.invalidColumns || [],
    missingColumns: result.missingColumns || [],
    extraTables: result.extraTables || [],
    extraColumns: result.extraColumns || [],
    missingIndexes: result.missingIndexes || [],
    invalidIndexes: result.invalidIndexes || [],
    extraIndexes: result.extraIndexes || [],
    ...(result.reason ? { reason: result.reason } : {}),
  };
}

module.exports = {
  SCHEMA_STATUS,
  CONTRACT_VERSION,
  verifyDatabaseSchema,
  assertDatabaseSchemaReady,
  createSchemaNotReadyError,
  toSafeSchemaDiagnostics,
  RUNTIME_REQUIRED_COLUMNS,
};
