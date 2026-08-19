'use strict';
const { normalizeTrainingPercent } = require('../utils/trainingPercent');

const TRAINING_SNAPSHOT_COLUMN = 'training_percent_snapshot';
const COMPETING_REPORT_TRAINING_COLUMN = 'training_percent';
const EXPECTED_TABLES = ['production_reports_temp', 'production_reports'];
const EXPECTED_TYPE = 'decimal(7,2)';

function normalizeColumnType(value) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, '');
}

function schemaFinding({ table, issue, actualType = null, details = null }) {
  return {
    scope: 'schema',
    table,
    column: TRAINING_SNAPSHOT_COLUMN,
    expected_type: EXPECTED_TYPE,
    actual_type: actualType,
    classification: 'REVIEW_REQUIRED',
    reason: 'TRAINING_SCHEMA_INCONSISTENCY',
    issue,
    ...(details ? { details } : {})
  };
}

function inspectTrainingSnapshotTableSchema(table, columns) {
  const normalized = Array.isArray(columns) ? columns : [];
  const byName = new Map(
    normalized.map((column) => [String(column.Field ?? column.field ?? '').trim().toLowerCase(), column])
  );
  const findings = [];
  const snapshot = byName.get(TRAINING_SNAPSHOT_COLUMN);

  if (!snapshot) {
    findings.push(schemaFinding({ table, issue: 'SNAPSHOT_COLUMN_MISSING' }));
  } else {
    const actualType = normalizeColumnType(snapshot.Type ?? snapshot.type);
    if (actualType !== EXPECTED_TYPE) {
      findings.push(schemaFinding({
        table,
        issue: 'SNAPSHOT_COLUMN_TYPE_INCOMPATIBLE',
        actualType
      }));
    }
  }

  if (byName.has(COMPETING_REPORT_TRAINING_COLUMN)) {
    findings.push(schemaFinding({
      table,
      issue: 'COMPETING_REPORT_TRAINING_AUTHORITY_COLUMN',
      details: COMPETING_REPORT_TRAINING_COLUMN
    }));
  }

  return findings;
}

function inspectTrainingSnapshotSchemas(schemaByTable) {
  const findings = [];
  for (const table of EXPECTED_TABLES) {
    findings.push(...inspectTrainingSnapshotTableSchema(table, schemaByTable?.[table]));
  }

  const types = EXPECTED_TABLES.map((table) => {
    const columns = schemaByTable?.[table] || [];
    const snapshot = columns.find(
      (column) => String(column.Field ?? column.field ?? '').trim().toLowerCase() === TRAINING_SNAPSHOT_COLUMN
    );
    return snapshot ? normalizeColumnType(snapshot.Type ?? snapshot.type) : null;
  });
  if (types.every(Boolean) && new Set(types).size > 1) {
    findings.push(schemaFinding({
      table: EXPECTED_TABLES.join(','),
      issue: 'TEMP_APPROVED_SNAPSHOT_SCHEMA_MISMATCH',
      details: types.join(' vs ')
    }));
  }
  return findings;
}

async function auditTrainingSnapshotSchema(query) {
  if (typeof query !== 'function') throw new TypeError('query is required');
  const schemaByTable = {};
  const findings = [];

  for (const table of EXPECTED_TABLES) {
    try {
      schemaByTable[table] = await query(`SHOW COLUMNS FROM ${table}`);
    } catch (error) {
      findings.push(schemaFinding({
        table,
        issue: 'SCHEMA_METADATA_READ_FAILED',
        details: error?.code || error?.message || 'UNKNOWN_SCHEMA_ERROR'
      }));
      schemaByTable[table] = [];
    }
  }

  findings.push(...inspectTrainingSnapshotSchemas(schemaByTable));
  return { schemaByTable, findings };
}

function classifyTrainingSnapshotRow(row) {
  const snapshotMissing = row.training_percent_snapshot === null || row.training_percent_snapshot === undefined || String(row.training_percent_snapshot).trim() === '';
  if (!snapshotMissing) return null;
  const currentMaster = normalizeTrainingPercent(row.current_training_percent, 100);
  return {
    scope: 'row',
    report_type: row.report_type,
    report_id: Number(row.report_id),
    work_date: String(row.work_date).slice(0, 10),
    worker_id: Number(row.worker_id),
    stored_training_percent_snapshot: null,
    current_master_training_percent: currentMaster,
    classification: 'REVIEW_REQUIRED',
    reason: 'MISSING_TRAINING_SNAPSHOT_CURRENT_MASTER_DRIFT_RISK'
  };
}

module.exports = {
  TRAINING_SNAPSHOT_COLUMN,
  EXPECTED_TABLES,
  EXPECTED_TYPE,
  classifyTrainingSnapshotRow,
  inspectTrainingSnapshotTableSchema,
  inspectTrainingSnapshotSchemas,
  auditTrainingSnapshotSchema
};
