const db = require('../config/db');

const query = (sql, params = []) => new Promise((resolve, reject) => {
  db.query(sql, params, (error, rows) => error ? reject(error) : resolve(rows));
});

// Canonical GC / Gia công NG master data.
// DB codes are unique per process (CAT01..CAT10, LONG01..LONG08).
// The worker UI displays the factory numeric error numbers 1-10 / 1-8.
// Historical defect rows are never deleted; only the active GC master is synchronized.
const CANONICAL_GC_DEFECTS = [
  ['CAT01', 'Cao su không đứt', 1], ['CAT02', 'Cắt lẹm', 2], ['CAT03', 'Cắt phạm', 3],
  ['CAT04', 'Cao su ngắn', 4], ['CAT05', 'Cao su dài', 5], ['CAT06', 'Bavia cao su', 6],
  ['CAT07', 'Phế phẩm chỉnh máy', 7], ['CAT08', 'Lỗi cao su ( NCC )', 8], ['CAT09', 'Lẫn cao su', 9],
  ['CAT10', 'Khác', 10], ['LONG01', 'Không qua dưỡng', 1], ['LONG02', 'Cao su vỡ', 2],
  ['LONG03', 'Trục xước', 3], ['LONG04', 'Trục gãy, cong', 4], ['LONG05', 'Thiếu cao su', 5],
  ['LONG06', 'Lẫn trục', 6], ['LONG07', 'Lẫn cao su', 7], ['LONG08', 'Khác', 8],
];

function normalize(value) { return String(value ?? '').trim().toLowerCase(); }
function errorDetails(error) { return { message: String(error?.message || error || ''), code: error?.code ?? null, errno: error?.errno ?? null, sqlState: error?.sqlState ?? null, sqlMessage: error?.sqlMessage ?? null, status: error?.status ?? error?.statusCode ?? null }; }
async function queryWithRetry(sql, params = [], attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try { return await query(sql, params); } catch (error) {
      lastError = error;
      const status = Number(error?.status ?? error?.statusCode ?? 0);
      if (status !== 520 || attempt === attempts) throw error;
      await new Promise(resolve => setTimeout(resolve, 150 * attempt));
    }
  }
  throw lastError;
}

async function ensureGcDefectMasterData() {
  const processes = await queryWithRetry(`
    SELECT id FROM processes
    WHERE UPPER(TRIM(process_code)) = 'GC'
      AND COALESCE(status, 'active') IN ('active', 'enabled', '1')
    ORDER BY id LIMIT 1`);
  if (!processes.length) throw new Error('GC process master was not found.');
  const processId = Number(processes[0].id);

  const canonicalCodes = CANONICAL_GC_DEFECTS.map(([code]) => code);
  const placeholders = canonicalCodes.map(() => '?').join(', ');
  await queryWithRetry(`
    UPDATE defect_types SET status = 'inactive'
    WHERE process_id = ? AND defect_code IS NOT NULL
      AND UPPER(TRIM(defect_code)) NOT IN (${placeholders})`, [processId, ...canonicalCodes]);

  for (const [defectCode, defectName, sortOrder] of CANONICAL_GC_DEFECTS) {
    try {
      await queryWithRetry(`
        INSERT INTO defect_types (process_id, defect_code, defect_name, sort_order, status)
        VALUES (?, ?, ?, ?, 'active')
        ON DUPLICATE KEY UPDATE defect_name = VALUES(defect_name), sort_order = VALUES(sort_order), status = 'active'`,
        [processId, defectCode, defectName, sortOrder]);
    } catch (error) {
      console.error('[KTC] GC defect upsert failed', { processId, defectCode, defectName, sortOrder, ...errorDetails(error) });
      throw error;
    }
  }

  const canonicalCodesSet = new Set(CANONICAL_GC_DEFECTS.map(([code]) => normalize(code)));
  const rows = await queryWithRetry(`SELECT id, defect_code FROM defect_types WHERE process_id = ? ORDER BY id`, [processId]);
  const seenCanonicalCodes = new Set();
  for (const row of rows || []) {
    const code = normalize(row.defect_code);
    if (!canonicalCodesSet.has(code)) continue;
    if (seenCanonicalCodes.has(code)) await queryWithRetry('UPDATE defect_types SET status = \'inactive\' WHERE id = ?', [Number(row.id)]);
    else seenCanonicalCodes.add(code);
  }

  const verifyRows = await queryWithRetry(`
    SELECT defect_code, defect_name, sort_order FROM defect_types
    WHERE process_id = ? AND COALESCE(status, 'active') IN ('active', 'enabled', '1')
    ORDER BY sort_order, id`, [processId]);
  if (verifyRows.length !== CANONICAL_GC_DEFECTS.length) {
    const actual = (verifyRows || []).map(row => ({ code: row.defect_code, name: row.defect_name, sortOrder: row.sort_order }));
    const error = new Error(`GC defect master verification failed: expected ${CANONICAL_GC_DEFECTS.length} active rows, got ${verifyRows.length}`);
    error.details = { processId, actual };
    throw error;
  }
  console.log(`GC_DEFECT_MASTER_OK process_id=${processId} active=${verifyRows.length}`);
}

module.exports = ensureGcDefectMasterData;

if (require.main === module) {
  ensureGcDefectMasterData().then(() => process.exit(0)).catch(error => {
    console.error('[KTC] Failed to ensure exact GC NG master data:', errorDetails(error));
    process.exit(1);
  });
}
