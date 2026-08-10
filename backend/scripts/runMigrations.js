'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const db = require('../config/db');
const { runMasterSeed } = require('./runMasterSeed');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

function checksum(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

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
  }
}

async function run() {
  await db.testConnection();
  await ensureMigrationTable();

  const files = (await fs.readdir(MIGRATIONS_DIR))
    .filter((name) => /^\d+_.*\.sql$/i.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  for (const file of files) {
    const sql = await fs.readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    const digest = checksum(sql);
    const [rows] = await db.promise().query(
      'SELECT checksum FROM schema_migrations WHERE migration_id=? LIMIT 1',
      [file],
    );

    if (rows[0]) {
      if (rows[0].checksum !== digest) {
        throw new Error(`Migration đã chạy nhưng checksum thay đổi: ${file}`);
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

  await runMasterSeed({ closePool: false });
}

run()
  .catch((error) => {
    console.error('MIGRATION FAILED:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.closePool().catch(() => undefined);
  });
