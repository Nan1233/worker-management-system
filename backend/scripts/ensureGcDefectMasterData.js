const db = require('../config/db');

const isCloudflareWorker = process.env.KTC_CLOUDFLARE_WORKER === 'true' || Boolean(globalThis.__KTC_CLOUDFLARE_WORKER);

const query = (sql, params = []) => new Promise((resolve, reject) => {
  db.query(sql, params, (error, rows) => error ? reject(error) : resolve(rows));
});

// Canonical source of truth for GC / Gia công NG master data.
// Historical rows are never deleted; only the active master is synchronized.
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

function normalize(value) {
  return String(value ?? '').trim().toLowerCase();
}

function errorDetails(error) {
  return {
    message: String(error?.message || error || ''),
    code: error?.code ?? null,
    errno: error?.errno ?? null,
    sqlState: error?.sqlState ?? null,
    sqlMessage: error?.sqlMessage ?? null,
  };
}

async function ensureGcDefectMasterData() {
  // db.query callback resolves the rows array directly. Do NOT destructure it
  // as [rows]; doing so turns the first DB row into the rows variable and makes
  // Cloudflare/TiDB bootstrap fail before the master can be synchronized.
  const processes = await query(`
    SELECT id
      FROM processes
     WHERE UPPER(TRIM(process_code)) = 'GC'
       AND COALESCE(status, 'active') IN ('active', 'enabled', '1')
     ORDER BY id
     LIMIT 1
  `);

  if (!processes.length) {
    throw new Error('GC process master was not found.');
  }

  const processId = Number(processes[0].id);

  const sync = async () => {
    const canonicalCodes = CANONICAL_GC_DEFECTS.map(([code]) => code);
    const placeholders = canonicalCodes.map(() => '?').join(', ');

    // Deactivate every legacy/non-canonical GC defect without deleting it.
    await query(
      `UPDATE defect_types
          SET status = 'inactive'
        WHERE process_id = ?
          AND defect_code IS NOT NULL
          AND UPPER(TRIM(defect_code)) NOT IN (${placeholders})`,
      [processId, ...canonicalCodes],
    );

    for (let index = 0; index < CANONICAL_GC_DEFECTS.length; index += 1) {
      const [defectCode, defectName] = CANONICAL_GC_DEFECTS[index];
      const sortOrder = index + 1;

      try {
        await query(
          `INSERT INTO defect_types
            (process_id, defect_code, defect_name, sort_order, status)
           VALUES (?, ?, ?, ?, 'active')
           ON DUPLICATE KEY UPDATE
             defect_name = VALUES(defect_name),
             sort_order = VALUES(sort_order),
             status = 'active'`,
          [processId, defectCode, defectName, sortOrder],
        );
      } catch (error) {
        console.error('[KTC] GC defect upsert failed', {
          processId,
          defectCode,
          defectName,
          sortOrder,
          ...errorDetails(error),
        });
        throw error;
      }
    }

    const canonicalCodeSet = new Set(canonicalCodes.map(normalize));
    const rows = await query(
      `SELECT id, defect_code, defect_name, status
         FROM defect_types
        WHERE process_id = ?
        ORDER BY id`,
      [processId],
    );

    const seenCanonicalCodes = new Set();
    for (const row of rows || []) {
      const code = normalize(row.defect_code);
      if (!canonicalCodeSet.has(code)) continue;

      if (seenCanonicalCodes.has(code)) {
        await query(
          `UPDATE defect_types SET status = 'inactive' WHERE id = ?`,
          [Number(row.id)],
        );
      } else {
        seenCanonicalCodes.add(code);
      }
    }

    const verifyRows = await query(
      `SELECT defect_code, defect_name, sort_order
         FROM defect_types
        WHERE process_id = ?
          AND COALESCE(status, 'active') IN ('active', 'enabled', '1')
        ORDER BY sort_order, id`,
      [processId],
    );

    if (verifyRows.length !== CANONICAL_GC_DEFECTS.length) {
      const actual = (verifyRows || []).map((row) => ({
        code: row.defect_code,
        name: row.defect_name,
        sortOrder: row.sort_order,
      }));
      const error = new Error(
        `GC defect master verification failed: expected ${CANONICAL_GC_DEFECTS.length} active rows, got ${verifyRows.length}`,
      );
      error.details = { processId, actual };
      throw error;
    }

    console.log(`GC_DEFECT_MASTER_OK process_id=${processId} active=${verifyRows.length}`);
  };

  // Cloudflare/TiDB Serverless does not need transaction control here and
  // request isolates must be allowed to retry safely.
  if (isCloudflareWorker) {
    try {
      await sync();
      return;
    } catch (error) {
      console.error('[KTC] Cloudflare GC master-data seed failed', {
        ...errorDetails(error),
        details: error?.details ?? null,
      });
      throw error;
    }
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
      console.error('[KTC] Failed to ensure exact GC NG master data:', errorDetails(error));
      process.exit(1);
    });
}
