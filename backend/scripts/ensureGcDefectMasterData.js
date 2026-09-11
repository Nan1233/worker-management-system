#!/usr/bin/env node
'use strict';

const mysql = require('mysql2/promise');

const required = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`GC_DEFECT_MASTER_FAILED: Missing database environment: ${missing.join(', ')}`);
  process.exitCode = 1;
  return;
}

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

// This is the factory source of truth for GC / Gia công NG master data.
// Keep this in backend bootstrap as well as the SQL migration so a fresh
// Cloudflare/Render instance cannot resurrect the legacy 16-item list.
const CANONICAL_GC_DEFECTS = [
  ['KQD', 'KQD'],
  ['VO_CAO_SU', 'Vỡ cao su'],
  ['K_XUOC_CONG_GAY', 'K xước cong gãy'],
  ['CAO_SU_XOAY', 'Cao su xoay'],
  ['CAT_KHONG_DUT', 'Cắt không đứt'],
  ['BAVIA', 'Bavia'],
  ['CSH', 'CSH'],
  ['PPCM', 'ppcm'],
  ['KT_LON', 'KT lớn'],
  ['KT_NHO', 'KT nhỏ'],
  ['LCS', 'LCS'],
  ['CAT_LEM', 'cắt lẹm'],
  ['RACH_NVL', 'rách nvl'],
  ['CHAN_NGAN_DAI', 'Chân ngắn dài'],
  ['SOT_VIA', 'sót via'],
  ['FURE_TRUC', 'fure trục'],
  ['LAN_CS', 'lẫn cs'],
  ['BAVIA_CAT_HUT', 'bavia cắt hụt'],
  ['THIEU_CAO_SU', 'thiếu cao su'],
];

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

    // Reuse existing rows by exact name first. If a canonical code already
    // exists on a legacy row, reuse that row too. This keeps historical FK
    // references intact and avoids creating duplicate master rows.
    const usedIds = new Set();

    for (const [index, [defectCode, defectName]] of CANONICAL_GC_DEFECTS.entries()) {
      const [rows] = await db.execute(
        `SELECT id, defect_code, defect_name
           FROM defect_types
          WHERE process_id = ?
            AND (
              LOWER(TRIM(defect_name)) = LOWER(TRIM(?))
              OR UPPER(TRIM(defect_code)) = UPPER(TRIM(?))
            )
          ORDER BY
            CASE WHEN LOWER(TRIM(defect_name)) = LOWER(TRIM(?)) THEN 0 ELSE 1 END,
            CASE WHEN UPPER(TRIM(defect_code)) = UPPER(TRIM(?)) THEN 0 ELSE 1 END,
            id
          LIMIT 1`,
        [processId, defectName, defectCode, defectName, defectCode],
      );

      if (rows.length) {
        const id = Number(rows[0].id);
        usedIds.add(id);
        await db.execute(
          `UPDATE defect_types
              SET defect_code = ?,
                  defect_name = ?,
                  sort_order = ?,
                  status = 'active'
            WHERE id = ?`,
          [defectCode, defectName, index + 1, id],
        );
      } else {
        await db.execute(
          `INSERT INTO defect_types
            (process_id, defect_code, defect_name, sort_order, status)
           VALUES (?, ?, ?, ?, 'active')`,
          [processId, defectCode, defectName, index + 1],
        );
      }
    }

    // Only these 19 entries are active for GC. Legacy rows remain in the DB
    // for historical reports but must never be returned by the active master.
    const [activeRows] = await db.execute(
      `SELECT id, defect_name
         FROM defect_types
        WHERE process_id = ?
          AND COALESCE(status, 'active') IN ('active', 'enabled', '1')`,
      [processId],
    );

    const canonicalNames = new Set(CANONICAL_GC_DEFECTS.map(([, name]) => name.toLowerCase().trim()));
    for (const row of activeRows) {
      if (!canonicalNames.has(String(row.defect_name || '').toLowerCase().trim())) {
        await db.execute(`UPDATE defect_types SET status = 'inactive' WHERE id = ?`, [row.id]);
      }
    }

    const [verifyRows] = await db.execute(
      `SELECT defect_code, defect_name, sort_order
         FROM defect_types
        WHERE process_id = ?
          AND COALESCE(status, 'active') IN ('active', 'enabled', '1')
        ORDER BY sort_order, id`,
      [processId],
    );

    if (verifyRows.length !== CANONICAL_GC_DEFECTS.length) {
      throw new Error(`GC defect master verification failed: expected ${CANONICAL_GC_DEFECTS.length} active rows, got ${verifyRows.length}.`);
    }

    await db.commit();
    console.log(`GC_DEFECT_MASTER_OK process_id=${processId} active=${verifyRows.length}`);
  } catch (error) {
    await db.rollback();
    throw error;
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error('GC_DEFECT_MASTER_FAILED:', error.message);
  process.exitCode = 1;
});
