#!/usr/bin/env node
'use strict';

const mysql = require('mysql2/promise');

const required = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`GC_XOAY_MASTER_FAILED: Missing database environment: ${missing.join(', ')}`);
  process.exitCode = 1;
  return;
}

// TiDB Cloud Serverless requires TLS. The main backend already follows the
// same safe default: SSL is enabled unless explicitly disabled. For the
// bootstrap script we keep certificate verification configurable so existing
// Render deployments work even when DB_SSL_CA is not provided.
const rawSsl = String(process.env.DB_SSL ?? process.env.MYSQL_SSL ?? 'true').toLowerCase();
const useSsl = ['true', '1', 'yes'].includes(rawSsl);
const sslCa = String(process.env.DB_SSL_CA ?? '').trim().replace(/\\\\n/g, '\\n');
const ssl = useSsl
  ? {
      minVersion: 'TLSv1.2',
      rejectUnauthorized: false,
      ...(sslCa ? { ca: sslCa } : {}),
    }
  : undefined;

const cfg = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 4000),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl,
};

async function main() {
  const db = await mysql.createConnection(cfg);
  try {
    await db.beginTransaction();

    const [processes] = await db.execute(
      `SELECT id
         FROM processes
        WHERE UPPER(TRIM(process_code)) = 'GC'
          AND COALESCE(status, 'active') IN ('active', 'enabled', '1')
        ORDER BY id
        LIMIT 1`,
    );

    if (!processes.length) throw new Error('GC process master was not found.');

    const processId = Number(processes[0].id);

    const [rows] = await db.execute(
      `SELECT id
         FROM defect_types
        WHERE process_id = ?
          AND (UPPER(TRIM(defect_code)) = 'XOAY'
               OR LOWER(TRIM(defect_name)) = LOWER('Cao su xoay'))
        ORDER BY CASE WHEN UPPER(TRIM(defect_code)) = 'XOAY' THEN 0 ELSE 1 END, id
        LIMIT 1`,
      [processId],
    );

    if (rows.length) {
      await db.execute(
        `UPDATE defect_types
            SET defect_code = 'XOAY', defect_name = 'Cao su xoay', status = 'active'
          WHERE id = ?`,
        [rows[0].id],
      );
    } else {
      const [maxRows] = await db.execute(
        `SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_sort_order
           FROM defect_types WHERE process_id = ?`,
        [processId],
      );
      const nextSortOrder = Number(maxRows[0]?.next_sort_order || 1);
      await db.execute(
        `INSERT INTO defect_types
          (process_id, defect_code, defect_name, sort_order, status)
         VALUES (?, 'XOAY', 'Cao su xoay', ?, 'active')`,
        [processId, nextSortOrder],
      );
    }

    const [xoayRows] = await db.execute(
      `SELECT id FROM defect_types
        WHERE process_id = ? AND UPPER(TRIM(defect_code)) = 'XOAY'
        ORDER BY id`,
      [processId],
    );
    for (const [index, row] of xoayRows.entries()) {
      if (index > 0) {
        await db.execute(`UPDATE defect_types SET status = 'inactive' WHERE id = ?`, [row.id]);
      }
    }

    await db.commit();
    console.log(`GC_XOAY_MASTER_OK process_id=${processId}`);
  } catch (error) {
    await db.rollback();
    throw error;
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error('GC_XOAY_MASTER_FAILED:', error.message);
  process.exitCode = 1;
});
