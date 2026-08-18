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
    const invalidColumns = [];
    const extraColumns = [];
    const missingIndexes = [];
    const invalidIndexes = [];
    const extraIndexes = [];

    for (const [table, contract] of Object.entries(canonical.tables)) {
      if (!actualTables.has(table)) continue;

      const [columns] = await executor.query(
        `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA
           FROM information_schema.columns
          WHERE table_schema = ?
            AND table_name = ?
          ORDER BY ORDINAL_POSITION`,
        [dbName, table],
      );

      const actualByColumn = new Map(
        columns.map((row) => [String(row.COLUMN_NAME).toLowerCase(), row]),
      );
      const expectedColumnNames = new Set(Object.keys(contract.columns));

      for (const [name, expected] of Object.entries(contract.columns)) {
        const actual = actualByColumn.get(name);
        if (!actual) {
          missingColumns.push(`${table}.${name}`);
          continue;
        }

        const diffs = compareColumn(expected, actual);
        if (diffs.length) {
          invalidColumns.push(`${table}.${name}: ${diffs.join('; ')}`);
        }
      }

      for (const name of actualByColumn.keys()) {
        if (!expectedColumnNames.has(name)) {
          extraColumns.push(`${table}.${name}`);
        }
      }

      const [indexRows] = await executor.query(
        `SELECT INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME
           FROM information_schema.statistics
          WHERE table_schema = ?
            AND table_name = ?
          ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
        [dbName, table],
      );

      const actualByIndex = new Map();
      for (const row of indexRows) {
        const name = String(row.INDEX_NAME).toLowerCase();
        if (!actualByIndex.has(name)) actualByIndex.set(name, []);
        actualByIndex.get(name).push(row);
      }

      const expectedIndexNames = new Set(Object.keys(contract.indexes));

      for (const [name, expected] of Object.entries(contract.indexes)) {
        const actual = actualByIndex.get(name);
        if (!actual) {
          missingIndexes.push(`${table}.${name}`);
          continue;
        }

        const diffs = compareIndex(expected, actual);
        if (diffs.length) {
          invalidIndexes.push(`${table}.${name}: ${diffs.join('; ')}`);
        }
      }

      for (const name of actualByIndex.keys()) {
        if (!expectedIndexNames.has(name)) {
          extraIndexes.push(`${table}.${name}`);
        }
      }
    }

    const ready =
      missingTables.length === 0 &&
      extraTables.length === 0 &&
      missingColumns.length === 0 &&
      invalidColumns.length === 0 &&
      extraColumns.length === 0 &&
      missingIndexes.length === 0 &&
      invalidIndexes.length === 0 &&
      extraIndexes.length === 0;

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
    missingTables: result.missingTables || [],
    extraTables: result.extraTables || [],
    missingColumns: result.missingColumns || [],
    invalidColumns: result.invalidColumns || [],
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
};
