const db = require('../config/db');

const isCloudflareWorker = process.env.KTC_CLOUDFLARE_WORKER === 'true' || Boolean(globalThis.__KTC_CLOUDFLARE_WORKER);
const query = (sql, params = []) => new Promise((resolve, reject) => {
  db.query(sql, params, (error, rows) => error ? reject(error) : resolve(rows));
});

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

// Manual first-time initialisation of the GC defect master (defect_types of the GC process).
//
// It is NOT part of `npm start` and never runs inside the Cloudflare Worker: the defect master is edited by
// admins (name, order, status) through the master-data screens and Excel import, and an automatic run used to
// overwrite those edits and deactivate every other GC defect on each restart.
//
// Behaviour:
//  * default / KTC_MANUAL_SEED_CONFIRM unset  -> DRY RUN: reads only and reports which canonical codes are missing.
//  * KTC_MANUAL_SEED_CONFIRM=YES (or --apply) -> INSERTs only the canonical codes that do not exist yet for the GC
//    process. Existing rows are never updated, re-activated, renamed, re-ordered or deactivated, and nothing is deleted.
async function ensureGcDefectMasterData({ apply = false } = {}) {
  if (isCloudflareWorker) return { skipped: true, reason: 'cloudflare-worker' };

  const processes = await queryWithRetry(`SELECT id FROM processes WHERE UPPER(TRIM(process_code))='GC' AND COALESCE(status,'active') IN ('active','enabled','1') ORDER BY id LIMIT 1`);
  if (!processes.length) throw new Error('GC process master was not found.');
  const processId = Number(processes[0].id);
  const existing = await queryWithRetry(`SELECT defect_code FROM defect_types WHERE process_id=?`, [processId]);
  const existingCodes = new Set((existing || []).map((row) => normalize(row.defect_code)));
  const missing = CANONICAL_GC_DEFECTS.filter(([code]) => !existingCodes.has(normalize(code)));

  if (!apply) {
    console.log(`GC_DEFECT_MASTER_DRY_RUN process_id=${processId} existing=${existingCodes.size} missing=${missing.map(([code]) => code).join(',') || 'none'} (no changes made)`);
    return { dryRun: true, processId, missing: missing.map(([code]) => code) };
  }
  for (const [code, name, sort] of missing) {
    await queryWithRetry(`INSERT INTO defect_types (process_id,defect_code,defect_name,sort_order,status) VALUES (?,?,?,?, 'active')`, [processId, code, name, sort]);
  }
  console.log(`GC_DEFECT_MASTER_APPLIED process_id=${processId} inserted=${missing.map(([code]) => code).join(',') || 'none'} (existing rows untouched)`);
  return { dryRun: false, processId, inserted: missing.map(([code]) => code) };
}

module.exports = ensureGcDefectMasterData;
if (require.main === module) {
  const apply = process.argv.includes('--apply') || process.env.KTC_MANUAL_SEED_CONFIRM === 'YES';
  ensureGcDefectMasterData({ apply }).then(() => process.exit(0)).catch(error => { console.error('[KTC] GC defect master seed failed:', errorDetails(error)); process.exit(1); });
}
