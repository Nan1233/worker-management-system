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
    for (let index = 0; index < CANONICAL_GC_DEFECTS.length; index += 1) {
      const [defectCode, defectName] = CANONICAL_GC_DEFECTS[index];
      const [rows] = await query(
        `SELECT id
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
        await query(
          `UPDATE defect_types
              SET defect_code = ?,
                  defect_name = ?,
                  sort_order = ?,
                  status = 'active'
            WHERE id = ?`,
          [defectCode, defectName, index + 1, Number(rows[0].id)],
        );
      } else {
        await query(
          `INSERT INTO defect_types
            (process_id, defect_code, defect_name, sort_order, status)
           VALUES (?, ?, ?, ?, 'active')`,
          [processId, defectCode, defectName, index + 1],
        );
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
