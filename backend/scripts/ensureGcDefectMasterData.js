const db = require('../config/db');

const isCloudflareWorker = process.env.KTC_CLOUDFLARE_WORKER === 'true' || Boolean(globalThis.__KTC_CLOUDFLARE_WORKER);

const query = (sql, params = []) => new Promise((resolve, reject) => {
  db.query(sql, params, (error, rows) => error ? reject(error) : resolve(rows));
});

// Factory source of truth for GC / Gia công NG master data.
// This is intentionally idempotent and runs at Cloudflare request bootstrap
// because SQL migration files are not automatically executed by that runtime.
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

const DUPLICATE_ENTRY_CODES = new Set(['ER_DUP_ENTRY', 1062, '1062']);

function isDuplicateEntryError(error) {
  const code = error?.code;
  const errno = error?.errno;
  const message = String(error?.message || '');
  return DUPLICATE_ENTRY_CODES.has(code)
    || DUPLICATE_ENTRY_CODES.has(errno)
    || /duplicate entry/i.test(message);
}

async function ensureGcDefectMasterData() {
  const [processes] = await Promise.all([
    query(`
      SELECT id
        FROM processes
       WHERE UPPER(TRIM(process_code)) = 'GC'
         AND COALESCE(status, 'active') IN ('active', 'enabled', '1')
       ORDER BY id
       LIMIT 1
    `),
  ]);

  if (!processes.length) throw new Error('GC process master was not found.');
  const processId = Number(processes[0].id);

  const sync = async () => {
    /*
     * Repair legacy duplicates before applying canonical codes.
     *
     * The unique key uq_defect_process_code is (process_id, defect_code).
     * Older data may contain two rows that are equivalent by defect name while
     * still having different/legacy codes. Updating one row to the canonical
     * code can then collide with the other row and produce ER_DUP_ENTRY.
     *
     * Keep the oldest row for each normalized canonical name and deactivate
     * extra active rows instead of deleting them (safer for historical FKs).
     */
    const [legacyRows] = await query(
      `SELECT id, defect_code, defect_name
         FROM defect_types
        WHERE process_id = ?
          AND COALESCE(status, 'active') IN ('active', 'enabled', '1')
        ORDER BY id`,
      [processId],
    );

    const canonicalByName = new Map(
      CANONICAL_GC_DEFECTS.map(([code, name]) => [String(name).trim().toLowerCase(), code]),
    );
    const seenCanonicalNames = new Set();

    for (const row of legacyRows || []) {
      const normalizedName = String(row.defect_name || '').trim().toLowerCase();
      if (!canonicalByName.has(normalizedName)) continue;
      if (seenCanonicalNames.has(normalizedName)) {
        await query(
          `UPDATE defect_types
              SET status = 'inactive'
            WHERE id = ?`,
          [Number(row.id)],
        );
      } else {
        seenCanonicalNames.add(normalizedName);
      }
    }

    for (let index = 0; index < CANONICAL_GC_DEFECTS.length; index += 1) {
      const [defectCode, defectName] = CANONICAL_GC_DEFECTS[index];

      // Prefer an already-canonical code; otherwise reuse the oldest matching
      // active name. This minimizes row churn and preserves historical IDs.
      let rows = await query(
        `SELECT id, defect_code, defect_name
           FROM defect_types
          WHERE process_id = ?
            AND COALESCE(status, 'active') IN ('active', 'enabled', '1')
            AND UPPER(TRIM(defect_code)) = UPPER(TRIM(?))
          ORDER BY id
          LIMIT 2`,
        [processId, defectCode],
      );

      if (!rows.length) {
        rows = await query(
          `SELECT id, defect_code, defect_name
             FROM defect_types
            WHERE process_id = ?
              AND COALESCE(status, 'active') IN ('active', 'enabled', '1')
              AND LOWER(TRIM(defect_name)) = LOWER(TRIM(?))
            ORDER BY id
            LIMIT 2`,
          [processId, defectName],
        );
      }

      const target = rows[0] || null;

      if (target) {
        // If a canonical-code row already exists, do not rewrite another row
        // into the same code. Just normalize the canonical row and deactivate
        // any redundant matching row returned by the query.
        await query(
          `UPDATE defect_types
              SET defect_code = ?,
                  defect_name = ?,
                  sort_order = ?,
                  status = 'active'
            WHERE id = ?`,
          [defectCode, defectName, index + 1, Number(target.id)],
        );

        for (const duplicate of rows.slice(1)) {
          await query(
            `UPDATE defect_types
                SET status = 'inactive'
              WHERE id = ?`,
            [Number(duplicate.id)],
          );
        }
      } else {
        try {
          await query(
            `INSERT INTO defect_types
              (process_id, defect_code, defect_name, sort_order, status)
             VALUES (?, ?, ?, ?, 'active')`,
            [processId, defectCode, defectName, index + 1],
          );
        } catch (error) {
          // Another Cloudflare isolate/request may have inserted the same
          // canonical row between our SELECT and INSERT. Re-read it and make
          // sure the request stays idempotent instead of bubbling 1062.
          if (!isDuplicateEntryError(error)) throw error;

          const [existing] = await query(
            `SELECT id
               FROM defect_types
              WHERE process_id = ?
                AND UPPER(TRIM(defect_code)) = UPPER(TRIM(?))
              ORDER BY id
              LIMIT 1`,
            [processId, defectCode],
          );
          if (!existing.length) throw error;

          await query(
            `UPDATE defect_types
                SET defect_name = ?,
                    sort_order = ?,
                    status = 'active'
              WHERE id = ?`,
            [defectName, index + 1, Number(existing[0].id)],
          );
        }
      }
    }

    const canonicalNames = CANONICAL_GC_DEFECTS.map(([, name]) => name.toLowerCase().trim());
    const placeholders = canonicalNames.map(() => '?').join(', ');
    await query(
      `UPDATE defect_types
          SET status = 'inactive'
        WHERE process_id = ?
          AND COALESCE(status, 'active') IN ('active', 'enabled', '1')
          AND LOWER(TRIM(defect_name)) NOT IN (${placeholders})`,
      [processId, ...canonicalNames],
    );

    const [verifyRows] = await query(
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

    console.log(`GC_DEFECT_MASTER_OK process_id=${processId} active=${verifyRows.length}`);
  };

  // TiDB Serverless used by Cloudflare should receive idempotent DML without
  // transaction control. Render keeps the transaction wrapper for mysql2.
  if (isCloudflareWorker) {
    await sync();
    return;
  }

  await query('START TRANSACTION');
  try {
    await sync();
    await query('COMMIT');
  } catch (error) {
    try { await query('ROLLBACK'); } catch (_) {}
    throw error;
  }
}

module.exports = ensureGcDefectMasterData;

if (require.main === module) {
  ensureGcDefectMasterData()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('[KTC] Failed to ensure exact GC NG master data:', error);
      process.exit(1);
    });
}
