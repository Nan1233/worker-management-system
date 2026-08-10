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


async function preflight(file) {
  if (file !== '008_client_request_idempotency.sql') return;
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
