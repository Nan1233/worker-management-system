'use strict';

/**
 * P0 runtime verification. This script is intentionally non-destructive:
 * it validates the canonical schema and exercises a real row-lock using a
 * temporary lock-row inside a transaction. It does not run migrations and it
 * does not create production reports.
 */

const crypto = require('node:crypto');
const db = require('../config/db');
const { verifyDatabaseSchema } = require('../services/databaseSchemaService');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function query(connection, sql, params = []) {
  const [rows] = await connection.query(sql, params);
  return rows;
}

async function verifyUniqueIdempotencyIndex(connection) {
  const rows = await query(
    connection,
    `SELECT INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME
       FROM information_schema.statistics
      WHERE table_schema = DATABASE()
        AND table_name = 'production_reports_temp'
        AND INDEX_NAME = 'uq_prt_worker_client_request'
      ORDER BY SEQ_IN_INDEX`,
  );

  const columns = rows.map((row) => String(row.COLUMN_NAME).toLowerCase());
  const unique = rows.length > 0 && Number(rows[0].NON_UNIQUE) === 0;
  if (!unique || columns.join(',') !== 'worker_id,client_request_id') {
    throw new Error(
      `P0 idempotency index invalid: unique=${unique} columns=${columns.join(',') || 'missing'}`,
    );
  }
}

async function verifyRowLock(connection1, connection2) {
  const logicalKey = `p0-runtime-${crypto.randomUUID().replace(/-/g, '').slice(0, 51)}`;
  let committed = false;
  let firstStarted = false;
  let secondStarted = false;

  try {
    await connection1.beginTransaction();
    firstStarted = true;
    await query(
      connection1,
      `INSERT INTO production_report_duplicate_locks (logical_key, last_used_at)
       VALUES (?, NOW())
       ON DUPLICATE KEY UPDATE last_used_at = last_used_at`,
      [logicalKey],
    );
    await query(
      connection1,
      `SELECT logical_key
         FROM production_report_duplicate_locks
        WHERE logical_key = ?
        FOR UPDATE`,
      [logicalKey],
    );

    await connection2.beginTransaction();
    secondStarted = true;
    const pending = query(
      connection2,
      `SELECT logical_key
         FROM production_report_duplicate_locks
        WHERE logical_key = ?
        FOR UPDATE`,
      [logicalKey],
    );

    const early = await Promise.race([
      pending.then(() => 'completed'),
      sleep(250).then(() => 'waiting'),
    ]);

    if (early !== 'waiting') {
      throw new Error('P0 row-lock probe did not block the second transaction');
    }

    await connection1.commit();
    committed = true;
    const result = await Promise.race([
      pending.then(() => 'completed'),
      sleep(3000).then(() => 'timeout'),
    ]);

    if (result !== 'completed') {
      throw new Error('P0 row-lock probe remained blocked after first transaction committed');
    }
  } finally {
    if (secondStarted) await connection2.rollback().catch(() => undefined);
    if (firstStarted && !committed) await connection1.rollback().catch(() => undefined);
    await query(connection2, 'DELETE FROM production_report_duplicate_locks WHERE logical_key = ?', [logicalKey]).catch(() => undefined);
    await query(connection1, 'DELETE FROM production_report_duplicate_locks WHERE logical_key = ?', [logicalKey]).catch(() => undefined);
  }
}

async function main() {
  const schema = await verifyDatabaseSchema();
  if (!schema.ready) {
    throw new Error(`Canonical DB contract is not READY: ${JSON.stringify({
      status: schema.status,
      missingTables: schema.missingTables,
      extraTables: schema.extraTables,
      missingColumns: schema.missingColumns,
      invalidColumns: schema.invalidColumns,
      extraColumns: schema.extraColumns,
      missingIndexes: schema.missingIndexes,
      invalidIndexes: schema.invalidIndexes,
      extraIndexes: schema.extraIndexes,
    })}`);
  }

  const connection1 = await db.promise().getConnection();
  const connection2 = await db.promise().getConnection();
  try {
    await verifyUniqueIdempotencyIndex(connection1);
    await verifyRowLock(connection1, connection2);
    console.log('P0 RUNTIME VERIFY: PASS');
    console.log(`Canonical schema contract: v${schema.contractVersion}`);
    console.log('Idempotency unique index: PASS');
    console.log('SELECT ... FOR UPDATE row-lock probe: PASS');
    console.log('Runtime migrations: NONE');
  } finally {
    connection2.release();
    connection1.release();
    await db.closePool();
  }
}

main().catch(async (error) => {
  console.error('P0 RUNTIME VERIFY: FAIL');
  console.error(error.message);
  await db.closePool().catch(() => undefined);
  process.exitCode = 1;
});
