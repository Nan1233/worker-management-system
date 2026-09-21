const db = require('../config/db');

const isCloudflareWorker = process.env.KTC_CLOUDFLARE_WORKER === 'true' || Boolean(globalThis.__KTC_CLOUDFLARE_WORKER);

const query = (sql, params = []) => new Promise((resolve, reject) => {
  db.query(sql, params, (error, rows) => error ? reject(error) : resolve(rows));
});

// Canonical source of truth for GC / Gia công NG master data.
// GC defect codes are explicitly split by the worker's selected operation:
//   Cắt  -> CAT01..CAT04
//   Lồng -> LONG01..LONG02
// Historical rows are never deleted; only the active master is synchronized.
const CANONICAL_GC_DEFECTS = [
  ['CAT01', 'Cao su xoay'],
  ['CAT02', 'Cắt không đứt'],
  ['CAT03', 'Lỗi kích thước'],
  ['CAT04', 'Cắt không đứt'],
  ['LONG01', 'KQD'],
  ['LONG02', 'Tuốt và lồng lại'],
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
    status: error?.status ?? error?.statusCode ?? null,
  };
}

async function queryWithRetry(sql, params = [], attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await query(sql, params);
    } catch (error) {
      lastError = error;
      const status = Number(error?.status ?? error?.statusCode ?? 0);
      if (status !== 520 || attempt === attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 150 * attempt));
    }
  }
  throw lastError;
}

async function ensureGcDefectMasterData() {
  const processes = await queryWithRetry(`
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

    await queryWithRetry(
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
        await queryWithRetry(
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
    const rows = await queryWithRetry(
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
        await queryWithRetry(`UPDATE defect_types SET status = 'inactive' WHERE id = ?`, [Number(row.id)]);
      } else {
        seenCanonicalCodes.add(code);
      }
    }

    const verifyRows = await queryWithRetry(
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
