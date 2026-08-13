'use strict';

const db = require('../config/db');
const {
  classifyTrainingSnapshotRow,
  auditTrainingSnapshotSchema
} = require('../services/trainingSnapshotAuditService');

async function query(sql, params = []) {
  const [rows] = await db.promise().query(sql, params);
  return rows;
}

async function main() {
  const schemaAudit = await auditTrainingSnapshotSchema(query);
  const schemaFindings = schemaAudit.findings;
  const missingSnapshotColumn = schemaFindings.some(
    (finding) => finding.issue === 'SNAPSHOT_COLUMN_MISSING' || finding.issue === 'SCHEMA_METADATA_READ_FAILED'
  );

  let rowFindings = [];
  if (!missingSnapshotColumn) {
    const rows = await query(`
      SELECT 'temp' AS report_type, pr.id AS report_id, pr.work_date, pr.worker_id,
             pr.training_percent_snapshot, w.training_percent AS current_training_percent
        FROM production_reports_temp pr
        LEFT JOIN workers w ON w.id = pr.worker_id
       WHERE pr.training_percent_snapshot IS NULL
      UNION ALL
      SELECT 'approved' AS report_type, pr.id AS report_id, pr.work_date, pr.worker_id,
             pr.training_percent_snapshot, w.training_percent AS current_training_percent
        FROM production_reports pr
        LEFT JOIN workers w ON w.id = pr.worker_id
       WHERE pr.training_percent_snapshot IS NULL
      ORDER BY work_date, report_type, report_id
    `);
    rowFindings = rows.map(classifyTrainingSnapshotRow).filter(Boolean);
  }

  const findings = [...schemaFindings, ...rowFindings];
  const summary = {
    total: findings.length,
    MISSING_TRAINING_SNAPSHOT: rowFindings.length,
    CURRENT_MASTER_DRIFT_RISK: rowFindings.length,
    TRAINING_SCHEMA_INCONSISTENCY: schemaFindings.length,
    AUTO_REPAIR_SAFE: 0,
    REVIEW_REQUIRED: findings.filter((finding) => finding.classification === 'REVIEW_REQUIRED').length,
    UNRESOLVED: 0
  };
  process.stdout.write(`${JSON.stringify({ summary, findings }, null, 2)}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error('TRAINING SNAPSHOT AUDIT FAILED:', error.message);
    process.exitCode = 1;
  }).finally(() => db.promise().end().catch(() => {}));
}

module.exports = { classifyTrainingSnapshotRow, auditTrainingSnapshotSchema };
