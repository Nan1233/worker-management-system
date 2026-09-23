const db = require('../config/db');
const runPendingMigrations = require('./runPendingMigrations');

const isCloudflareWorker = process.env.KTC_CLOUDFLARE_WORKER === 'true' || Boolean(globalThis.__KTC_CLOUDFLARE_WORKER);

const query = (sql, params = []) => new Promise((resolve, reject) => {
  db.query(sql, params, (error, rows) => error ? reject(error) : resolve(rows));
});

// Canonical GC / Gia công NG master data.
// CUT: 1-10. LONG: 1-8. Codes are numeric and scoped by process_id.
// Historical defect rows are never deleted; only the active GC master is synchronized.
const CANONICAL_GC_DEFECTS = [
  ['1', 'Cao su không đứt', 1, 'CUT'],
  ['2', 'Cắt lẹm', 2, 'CUT'],
  ['3', 'Cắt phạm', 3, 'CUT'],
  ['4', 'Cao su ngắn', 4, 'CUT'],
  ['5', 'Cao su dài', 5, 'CUT'],
  ['6', 'Bavia cao su', 6, 'CUT'],
  ['7', 'Phế phẩm chỉnh máy', 7, 'CUT'],
  ['8', 'Lỗi cao su ( NCC )', 8, 'CUT'],
  ['9', 'Lẫn cao su', 9, 'CUT'],
  ['10', 'Khác', 10, 'CUT'],
  ['1', 'Không qua dưỡng', 1, 'LONG'],
  ['2', 'Cao su vỡ', 2, 'LONG'],
  ['3', 'Trục xước', 3, 'LONG'],
  ['4', 'Trục gãy, cong', 4, 'LONG'],
  ['5', 'Thiếu cao su', 5, 'LONG'],
  ['6', 'Lẫn trục', 6, 'LONG'],
  ['7', 'Lẫn cao su', 7, 'LONG'],
  ['8', 'Khác', 8, 'LONG'],
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
  if (isCloudflareWorker) {
    await runPendingMigrations();
  }

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
    const canonicalCodes = [...new Set(CANONICAL_GC_DEFECTS.map(([code]) => code))];
    const placeholders = canonicalCodes.map(() => '?').join(', ');

    await queryWithRetry(
      `UPDATE defect_types
          SET status = 'inactive'
        WHERE process_id = ?
          AND defect_code IS NOT NULL
          AND UPPER(TRIM(defect_code)) NOT IN (${placeholders})`,
      [processId, ...canonicalCodes],
    );

    for (const [defectCode, defectName, sortOrder] of CANONICAL_GC_DEFECTS) {
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

    const canonicalKeys = new Set(
      CANONICAL_GC_DEFECTS.map(([code, name]) => `${normalize(code)}|${normalize(name)}`),
    );
    const rows = await queryWithRetry(
      `SELECT id, defect_code, defect_name, status
         FROM defect_types
        WHERE process_id = ?
        ORDER BY id`,
      [processId],
    );

    const seenCanonicalKeys = new Set();
    for (const row of rows || []) {
      const key = `${normalize(row.defect_code)}|${normalize(row.defect_name)}`;
      if (!canonicalKeys.has(key)) continue;
      if (seenCanonicalKeys.has(key)) {
        await queryWithRetry(`UPDATE defect_types SET status = 'inactive' WHERE id = ?`, [Number(row.id)]);
      } else {
        seenCanonicalKeys.add(key);
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
