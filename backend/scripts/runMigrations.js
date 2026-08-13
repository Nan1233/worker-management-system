'use strict';

const db = require('../config/db');
const { getCanonicalMigrationManifest } = require('../services/migrationManifestService');
const { analyzeMigrationState, SCHEMA_STATUS } = require('../services/databaseSchemaService');
const { FORMULA_EFFECTIVE_RANGE_MIGRATION, preflightFormulaEffectiveRangeMigration } = require('../services/migrationPreflightService');


function splitStatements(sql) {
  return sql
    .split(';')
    .map((statement) => statement.replace(/^\s*--.*$/gm, '').trim())
    .filter(Boolean);
}

async function ensureMigrationTable() {
  await db.promise().query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      migration_id VARCHAR(160) NOT NULL PRIMARY KEY,
      checksum CHAR(64) NOT NULL,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}


async function normalizeProductionDetailDuplicates() {
  const specs = [
    { table: 'production_temp_defects', parent: 'temp_report_id', type: 'defect_type_id', value: 'quantity' },
    { table: 'production_report_defects', parent: 'report_id', type: 'defect_type_id', value: 'quantity' },
    { table: 'production_temp_deductions', parent: 'temp_report_id', type: 'deduction_type_id', value: 'hours' },
    { table: 'production_report_deductions', parent: 'report_id', type: 'deduction_type_id', value: 'hours' },
  ];

  const connection = await db.promise().getConnection();
  try {
    await connection.beginTransaction();
    for (const spec of specs) {
      const [groups] = await connection.query(
        `SELECT ${spec.parent} AS parent_id, ${spec.type} AS type_id, COUNT(*) AS total
         FROM ${spec.table}
         GROUP BY ${spec.parent}, ${spec.type}
         HAVING COUNT(*) > 1`,
      );
      for (const group of groups) {
        const [rows] = await connection.query(
          `SELECT id, ${spec.value} AS detail_value
           FROM ${spec.table}
           WHERE ${spec.parent}=? AND ${spec.type}=?
           ORDER BY id
           FOR UPDATE`,
          [group.parent_id, group.type_id],
        );
        if (rows.length < 2) continue;
        const keepId = Number(rows[0].id);
        const totalValue = rows.reduce((sum, row) => sum + Number(row.detail_value || 0), 0);
        const duplicateIds = rows.slice(1).map((row) => Number(row.id));
        await connection.query(
          `UPDATE ${spec.table} SET ${spec.value}=? WHERE id=?`,
          [totalValue, keepId],
        );
        await connection.query(
          `DELETE FROM ${spec.table} WHERE id IN (${duplicateIds.map(() => '?').join(',')})`,
          duplicateIds,
        );
        console.log(`NORMALIZED ${spec.table} ${group.parent_id}/${group.type_id}: ${rows.length} -> 1`);
      }
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function preflight(file) {
  if (file === '008_client_request_idempotency.sql') {
    const [duplicates] = await db.promise().query(`
      SELECT worker_id, client_request_id, COUNT(*) AS total
      FROM production_reports_temp
      WHERE client_request_id IS NOT NULL AND TRIM(client_request_id) <> ''
      GROUP BY worker_id, client_request_id
      HAVING COUNT(*) > 1
      LIMIT 20
    `);
    if (duplicates.length) {
      const sample = duplicates
        .map((row) => `${row.worker_id}/${row.client_request_id} x${row.total}`)
        .join(', ');
      throw new Error(`Không thể tạo UNIQUE client_request_id vì DB đang có dữ liệu trùng: ${sample}`);
    }
    return;
  }

  if (file === '016_integrity_constraints_20260810.sql') {
    await normalizeProductionDetailDuplicates();
    return;
  }

  if (file === FORMULA_EFFECTIVE_RANGE_MIGRATION) {
    await preflightFormulaEffectiveRangeMigration(db.promise());
  }
}

async function run() {
  await db.testConnection();
  await ensureMigrationTable();

  const manifest = getCanonicalMigrationManifest();
  const [appliedRows] = await db.promise().query(
    'SELECT migration_id, checksum, applied_at FROM schema_migrations ORDER BY migration_id',
  );
  const initialState = analyzeMigrationState(manifest, appliedRows);
  if ([SCHEMA_STATUS.CHECKSUM_MISMATCH, SCHEMA_STATUS.UNEXPECTED_FUTURE_MIGRATION, SCHEMA_STATUS.MIGRATION_STATE_INVALID].includes(initialState.status)) {
    const error = new Error(`Migration ledger không an toàn: ${initialState.status}`);
    error.code = initialState.status === SCHEMA_STATUS.CHECKSUM_MISMATCH
      ? 'MIGRATION_CHECKSUM_MISMATCH'
      : initialState.status;
    throw error;
  }

  for (const entry of manifest) {
    const file = entry.filename;
    const digest = entry.checksum;
    const sql = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'migrations', file), 'utf8');
    const rows = appliedRows.filter((row) => row.migration_id === file);

    if (rows[0]) {
      if (rows[0].checksum !== digest) {
        const error = new Error(`Migration đã chạy nhưng checksum thay đổi: ${file}`);
        error.code = 'MIGRATION_CHECKSUM_MISMATCH';
        throw error;
      }
      console.log(`SKIP ${file}`);
      continue;
    }

    await preflight(file);

    const statements = splitStatements(sql);
    for (const statement of statements) {
      try {
        await db.promise().query(statement);
      } catch (error) {
        // A unique/index migration may already have been applied by the
        // index-maintenance command before the migration runner was introduced.
        if (error?.code === 'ER_DUP_KEYNAME') continue;
        error.message = `${file}: ${error.message}`;
        throw error;
      }
    }

    await db.promise().query(
      'INSERT INTO schema_migrations (migration_id, checksum) VALUES (?, ?)',
      [file, digest],
    );
    console.log(`APPLIED ${file}`);
  }

}

run()
  .catch((error) => {
    console.error('MIGRATION FAILED:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.closePool().catch(() => undefined);
  });
