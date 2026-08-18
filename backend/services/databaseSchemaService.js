'use strict';

const db = require('../config/db');
const { CONTRACT_VERSION, getCanonicalSchema, compareColumn, compareIndex } = require('./canonicalSchemaContractService');

const SCHEMA_STATUS = Object.freeze({ READY: 'READY', DATABASE_UNAVAILABLE: 'DATABASE_UNAVAILABLE', CONTRACT_INVALID: 'DATABASE_CONTRACT_INVALID' });

async function verifyDatabaseSchema({ executor = db.promise() } = {}) {
  try {
    const canonical = getCanonicalSchema();
    const dbName = await currentDatabase(executor);
    const [tableRows] = await executor.query(
      `SELECT TABLE_NAME FROM information_schema.tables WHERE table_schema = DATABASE() AND TABLE_TYPE='BASE TABLE'`,
    );
    const actualTables = new Set(tableRows.map(r => String(r.TABLE_NAME).toLowerCase()));
    const missingTables = Object.keys(canonical.tables).filter(t => !actualTables.has(t));
    const missingColumns = [];
    const invalidColumns = [];
    const missingIndexes = [];
    const invalidIndexes = [];

    for (const [table, contract] of Object.entries(canonical.tables)) {
      if (!actualTables.has(table)) continue;
      const [columns] = await executor.query(
        `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA
           FROM information_schema.columns
          WHERE table_schema=? AND table_name=?`,
        [dbName, table],
      );
      const byColumn = new Map(columns.map(row => [String(row.COLUMN_NAME).toLowerCase(), row]));
      for (const [name, expected] of Object.entries(contract.columns)) {
        const actual = byColumn.get(name);
        if (!actual) missingColumns.push(`${table}.${name}`);
        else {
          const diffs = compareColumn(expected, actual);
          if (diffs.length) invalidColumns.push(`${table}.${name}: ${diffs.join('; ')}`);
        }
      }

      const [indexRows] = await executor.query(
        `SELECT INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME
           FROM information_schema.statistics
          WHERE table_schema=? AND table_name=?
          ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
        [dbName, table],
      );
      const byIndex = new Map();
      for (const row of indexRows) {
        const name = String(row.INDEX_NAME).toLowerCase();
        if (!byIndex.has(name)) byIndex.set(name, []);
        byIndex.get(name).push(row);
      }
      for (const [name, expected] of Object.entries(contract.indexes)) {
        const actual = byIndex.get(name);
        if (!actual) missingIndexes.push(`${table}.${name}`);
        else {
          const diffs = compareIndex(expected, actual);
          if (diffs.length) invalidIndexes.push(`${table}.${name}: ${diffs.join('; ')}`);
        }
      }
    }

    const ready = missingTables.length === 0 && missingColumns.length === 0 && invalidColumns.length === 0 && missingIndexes.length === 0 && invalidIndexes.length === 0;
    return {
      ready,
      status: ready ? SCHEMA_STATUS.READY : SCHEMA_STATUS.CONTRACT_INVALID,
      missingTables, missingColumns, invalidColumns, missingIndexes, invalidIndexes,
      contractVersion: canonical.version,
    };
  } catch (error) {
    const code = String(error?.code || 'DATABASE_UNAVAILABLE');
    const reason = code === 'ER_ACCESS_DENIED_ERROR' || code === 'ER_DBACCESS_DENIED_ERROR' ? 'ACCESS_DENIED'
      : /ssl|tls|certificate/i.test(String(error?.message || '')) ? 'TLS_ERROR'
      : /timeout|timed out|etimedout/i.test(String(error?.message || '')) ? 'TIMEOUT' : 'CONNECTION_ERROR';
    return { ready: false, status: SCHEMA_STATUS.DATABASE_UNAVAILABLE, missingTables: [], missingColumns: [], invalidColumns: [], missingIndexes: [], invalidIndexes: [], contractVersion: CONTRACT_VERSION, error, reason };
  }
}

async function currentDatabase(executor) {
  const [rows] = await executor.query('SELECT DATABASE() AS db_name');
  return rows[0]?.db_name;
}

function createSchemaNotReadyError(result) {
  const error = new Error(`Database schema not ready: ${result.status}`);
  error.code = result.status === SCHEMA_STATUS.DATABASE_UNAVAILABLE ? 'DATABASE_UNAVAILABLE' : 'DATABASE_CONTRACT_INVALID';
  error.schemaStatus = result.status; error.status = 503; error.statusCode = 503; error.isPublic = false;
  error.details = {
    missingTables: result.missingTables || [], missingColumns: result.missingColumns || [],
    invalidColumns: result.invalidColumns || [], missingIndexes: result.missingIndexes || [], invalidIndexes: result.invalidIndexes || [],
    contractVersion: result.contractVersion || CONTRACT_VERSION,
  };
  return error;
}

async function assertDatabaseSchemaReady(options = {}) { const result = await verifyDatabaseSchema(options); if (!result.ready) throw createSchemaNotReadyError(result); return result; }
function toSafeSchemaDiagnostics(result) {
  return {
    status: result.status, schemaReady: Boolean(result.ready), contractVersion: result.contractVersion || CONTRACT_VERSION,
    missingTables: result.missingTables || [], missingColumns: result.missingColumns || [], invalidColumns: result.invalidColumns || [],
    missingIndexes: result.missingIndexes || [], invalidIndexes: result.invalidIndexes || [], ...(result.reason ? { reason: result.reason } : {}),
  };
}
module.exports = { SCHEMA_STATUS, CONTRACT_VERSION, verifyDatabaseSchema, assertDatabaseSchemaReady, createSchemaNotReadyError, toSafeSchemaDiagnostics };
