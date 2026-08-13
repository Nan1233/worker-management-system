'use strict';

const {
  getCanonicalMigrationManifest,
  getExpectedSchemaMetadata,
  migrationVersion,
} = require('./migrationManifestService');

const SCHEMA_STATUS = Object.freeze({
  READY: 'READY',
  MIGRATIONS_PENDING: 'MIGRATIONS_PENDING',
  CHECKSUM_MISMATCH: 'CHECKSUM_MISMATCH',
  UNEXPECTED_FUTURE_MIGRATION: 'UNEXPECTED_FUTURE_MIGRATION',
  MIGRATION_STATE_INVALID: 'MIGRATION_STATE_INVALID',
  DATABASE_UNAVAILABLE: 'DATABASE_UNAVAILABLE',
});

function summarizeMigration(entry) {
  return entry ? { version: entry.version, filename: entry.filename, checksum: entry.checksum } : null;
}

function latestByVersion(entries) {
  return [...entries]
    .filter((entry) => Number.isInteger(entry.version))
    .sort((a, b) => a.version - b.version || a.filename.localeCompare(b.filename))
    .at(-1) || null;
}

function analyzeMigrationState(expectedManifest, actualRows) {
  const expected = expectedManifest.map((entry) => ({ ...entry }));
  const actual = (actualRows || []).map((row) => ({
    filename: String(row.migration_id || row.filename || ''),
    checksum: String(row.checksum || ''),
    appliedAt: row.applied_at || row.appliedAt || null,
    version: migrationVersion(row.migration_id || row.filename),
  }));

  const expectedByFilename = new Map(expected.map((entry) => [entry.filename, entry]));
  const actualByFilename = new Map();
  const duplicateActual = [];
  for (const entry of actual) {
    if (actualByFilename.has(entry.filename)) duplicateActual.push(entry.filename);
    actualByFilename.set(entry.filename, entry);
  }

  const expectedLatest = latestByVersion(expected);
  const actualLatest = latestByVersion(actual);
  const unexpected = actual.filter((entry) => !expectedByFilename.has(entry.filename));
  const future = unexpected.filter((entry) => entry.version != null && expectedLatest && entry.version > expectedLatest.version);

  const base = {
    ready: false,
    status: null,
    expectedLatest: summarizeMigration(expectedLatest),
    actualLatest: summarizeMigration(actualLatest),
    missingMigrations: [],
    checksumMismatches: [],
    unexpectedMigrations: unexpected.map(summarizeMigration),
  };

  if (future.length) {
    return { ...base, status: SCHEMA_STATUS.UNEXPECTED_FUTURE_MIGRATION };
  }

  if (unexpected.length || duplicateActual.length || actual.some((entry) => entry.version == null)) {
    return { ...base, status: SCHEMA_STATUS.MIGRATION_STATE_INVALID };
  }

  const checksumMismatches = [];
  const missing = [];
  for (const entry of expected) {
    const applied = actualByFilename.get(entry.filename);
    if (!applied) missing.push(entry);
    else if (applied.checksum !== entry.checksum) {
      checksumMismatches.push({
        filename: entry.filename,
        version: entry.version,
        expectedChecksum: entry.checksum,
        actualChecksum: applied.checksum,
      });
    }
  }

  if (checksumMismatches.length) {
    return { ...base, status: SCHEMA_STATUS.CHECKSUM_MISMATCH, checksumMismatches };
  }

  if (missing.length) {
    const actualVersions = new Set(actual.map((entry) => entry.version));
    const highestApplied = actualLatest?.version ?? 0;
    const missingMiddle = missing.some((entry) => entry.version <= highestApplied || actualVersions.has(entry.version));
    return {
      ...base,
      status: missingMiddle ? SCHEMA_STATUS.MIGRATION_STATE_INVALID : SCHEMA_STATUS.MIGRATIONS_PENDING,
      missingMigrations: missing.map(summarizeMigration),
    };
  }

  return { ...base, ready: true, status: SCHEMA_STATUS.READY };
}

function isMissingMigrationTableError(error) {
  return error?.code === 'ER_NO_SUCH_TABLE'
    || error?.errno === 1146
    || /schema_migrations.*doesn['’]?t exist/i.test(String(error?.message || ''));
}

function defaultExecutor() {
  return require('../config/db').promise();
}

async function loadActualMigrationLedger(executor = defaultExecutor()) {
  const [rows] = await executor.query(
    'SELECT migration_id, checksum, applied_at FROM schema_migrations ORDER BY migration_id',
  );
  return rows;
}

async function verifyDatabaseSchema({ executor = defaultExecutor(), manifest = getCanonicalMigrationManifest() } = {}) {
  try {
    const rows = await loadActualMigrationLedger(executor);
    return analyzeMigrationState(manifest, rows);
  } catch (error) {
    if (isMissingMigrationTableError(error)) {
      const state = analyzeMigrationState(manifest, []);
      return { ...state, status: SCHEMA_STATUS.MIGRATIONS_PENDING, ledgerMissing: true };
    }
    const metadata = getExpectedSchemaMetadata(manifest);
    return {
      ready: false,
      status: SCHEMA_STATUS.DATABASE_UNAVAILABLE,
      expectedLatest: metadata.expectedMigration
        ? { version: metadata.expectedSchemaVersion, filename: metadata.expectedMigration, checksum: metadata.expectedChecksum }
        : null,
      actualLatest: null,
      missingMigrations: [],
      checksumMismatches: [],
      unexpectedMigrations: [],
    };
  }
}

function createSchemaNotReadyError(result) {
  const error = new Error(`Database schema not ready: ${result.status}`);
  error.code = 'DATABASE_SCHEMA_NOT_READY';
  error.schemaStatus = result.status;
  error.status = 503;
  error.statusCode = 503;
  error.isPublic = false;
  error.details = {
    expectedLatest: result.expectedLatest?.filename || null,
    actualLatest: result.actualLatest?.filename || null,
    missingMigrations: (result.missingMigrations || []).map((item) => item.filename),
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
    expectedMigration: result.expectedLatest?.filename || null,
    actualMigration: result.actualLatest?.filename || null,
    missingMigrations: (result.missingMigrations || []).map((entry) => entry.filename),
  };
}

module.exports = {
  SCHEMA_STATUS,
  analyzeMigrationState,
  loadActualMigrationLedger,
  verifyDatabaseSchema,
  assertDatabaseSchemaReady,
  createSchemaNotReadyError,
  toSafeSchemaDiagnostics,
  isMissingMigrationTableError,
};
