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
    // Keep historical rows, but make the active GC master deterministic.
    // IMPORTANT: the unique key is (process_id, defect_code), regardless of
    // status. Therefore inactive legacy rows can still block an INSERT/UPDATE.
    const [allRows] = await query(
      `SELECT id, defect_code, defect_name, status
         FROM defect_types
        WHERE process_id = ?
        ORDER BY id`,
      [processId],
    );

    const canonicalByName = new Map(
      CANONICAL_GC_DEFECTS.map(([code, name]) => [String(name).trim().toLowerCase(), code]),
    );

    // First deactivate duplicate active rows for the same canonical name.
    const seenNames = new Set();
    for (const row of allRows || []) {
      const normalizedName = String(row.defect_name || '').trim().toLowerCase();
      if (!canonicalByName.has(normalizedName)) continue;
      if (seenNames.has(normalizedName) && ['active', 'enabled', '1'].includes(String(row.status ?? 'active'))) {
        await query(`UPDATE defect_types SET status = 'inactive' WHERE id = ?`, [Number(row.id)]);
      } else {
        seenNames.add(normalizedName);
      }
    }

    for (let index = 0; index < CANONICAL_GC_DEFECTS.length; index += 1) {
      const [defectCode, defectName] = CANONICAL_GC_DEFECTS[index];

      // Prefer an existing row that already owns the canonical code, even if
      // it is inactive. This avoids a unique-key collision with legacy rows.
      const [codeRows] = await query(
        `SELECT id, defect_code, defect_name, status
           FROM defect_types
          WHERE process_id = ?
            AND UPPER(TRIM(defect_code)) = UPPER(TRIM(?))
          ORDER BY id
          LIMIT 2`,
        [processId, defectCode],
      );

      const canonicalCodeRow = codeRows[0] || null;
      let target = canonicalCodeRow;

      if (!target) {
        const [nameRows] = await query(
          `SELECT id, defect_code, defect_name, status
             FROM defect_types
            WHERE process_id = ?
              AND LOWER(TRIM(defect_name)) = LOWER(TRIM(?))
              AND COALESCE(status, 'active') IN ('active', 'enabled', '1')
            ORDER BY id
            LIMIT 2`,
          [processId, defectName],
        );
        target = nameRows[0] || null;
      }

      if (target) {
        // If another active row already owns this canonical code, deactivate it
        // before reusing the canonical-code row. Historical IDs are preserved.
        if (codeRows.length > 1) {
          for (const duplicate of codeRows.slice(1)) {
            await query(`UPDATE defect_types SET status = 'inactive' WHERE id = ?`, [Number(duplicate.id)]);
          }
        }

        if (canonicalCodeRow && target.id === canonicalCodeRow.id) {
          // The row already owns the unique key, so updating it is safe.
          await query(
            `UPDATE defect_types
                SET defect_name = ?, sort_order = ?, status = 'active'
              WHERE id = ?`,
            [defectName, index + 1, Number(target.id)],
          );
        } else {
          await query(
            `UPDATE defect_types
                SET defect_code = ?, defect_name = ?, sort_order = ?, status = 'active'
              WHERE id = ?`,
            [defectCode, defectName, index + 1, Number(target.id)],
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
          if (!isDuplicateEntryError(error)) throw error;

          // A concurrent isolate may have inserted the code, or an inactive
          // historical row may already own it. Re-read ALL statuses.
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
                SET defect_name = ?, sort_order = ?, status = 'active'
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
