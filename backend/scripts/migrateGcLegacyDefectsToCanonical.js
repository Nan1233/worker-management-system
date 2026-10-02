const db = require('../config/db');

const args = new Set(process.argv.slice(2));
const APPLY = args.has('--apply');
const FROM = process.env.FROM_DATE || '2026-09-01';
const TO = process.env.TO_DATE || '2026-10-01';

const query = (sql, params = []) => db.promise().query(sql, params).then(([rows]) => rows);

// These mappings are intentionally explicit and match the FE canonical labels.
// Unknown legacy values are NOT guessed and remain in tt_ng as unclassified.
const LEGACY_MAP = [
  ['kqd_dap_lai', 'CAT01'],
  ['kqd_tuot', 'CAT01'],
  ['vo_do_long', 'LONG02'],
  ['xuoc_do_long', 'LONG03'],
  ['cong_gay', 'LONG04'],
  ['xoay', 'XOAY'],
  ['khong_dut', 'CAT01'],
  ['bavia_hut', 'CAT06'],
  ['ppcm', 'CAT07'],
  ['loi_cao_su', 'CAT08'],
  ['ng_kich_thuoc', 'CAT10'],
  ['cat_lem', 'CAT02']
];

function n(value) { return Math.max(0, Number(value) || 0); }

async function main() {
  const processRows = await query(`SELECT id FROM processes WHERE UPPER(TRIM(process_code))='GC' AND COALESCE(status,'active') IN ('active','enabled','1') ORDER BY id LIMIT 1`);
  if (!processRows.length) throw new Error('GC process not found');
  const processId = Number(processRows[0].id);

  const masterRows = await query(`SELECT id,defect_code,defect_name FROM defect_types WHERE process_id=? AND status='active'`, [processId]);
  const master = new Map(masterRows.map(row => [String(row.defect_code).trim().toUpperCase(), row]));
  const requiredCodes = [...new Set(LEGACY_MAP.map(([, code]) => code))];
  const missing = requiredCodes.filter(code => !master.has(code));
  if (missing.length) throw new Error(`Missing active GC defect master codes: ${missing.join(', ')}`);

  const reports = await query(
    `SELECT pr.id,pr.tt_ng,pr.operation_mode,pr.kqd_dap_lai,pr.kqd_tuot,pr.vo_do_long,pr.xuoc_do_long,
            pr.cong_gay,pr.xoay,pr.khong_dut,pr.bavia_hut,pr.ppcm,pr.loi_cao_su,pr.ng_kich_thuoc,pr.cat_lem
       FROM production_reports pr
      WHERE pr.process_id=? AND LOWER(TRIM(COALESCE(pr.status,'')))='approved'
        AND pr.work_date>=? AND pr.work_date<?
      ORDER BY pr.id`,
    [processId, FROM, TO]
  );

  const ids = reports.map(r => Number(r.id));
  const existing = new Set();
  for (let i = 0; i < ids.length; i += 1000) {
    const batch = ids.slice(i, i + 1000);
    if (!batch.length) continue;
    const p = batch.map(() => '?').join(',');
    const rows = await query(`SELECT DISTINCT report_id FROM production_report_defects WHERE report_id IN (${p})`, batch);
    rows.forEach(r => existing.add(Number(r.report_id)));
  }

  let eligible = 0, insertedReports = 0, insertedRows = 0, skippedExisting = 0, skippedEmpty = 0, skippedOverflow = 0;
  const overflow = [];
  const samples = [];

  const plan = [];
  for (const report of reports) {
    const id = Number(report.id);
    if (existing.has(id)) { skippedExisting++; continue; }
    const grouped = new Map();
    for (const [field, code] of LEGACY_MAP) {
      const quantity = n(report[field]);
      if (quantity <= 0) continue;
      grouped.set(code, (grouped.get(code) || 0) + quantity);
    }
    if (!grouped.size) { skippedEmpty++; continue; }
    const detailTotal = [...grouped.values()].reduce((sum, value) => sum + value, 0);
    const totalNg = n(report.tt_ng);
    if (detailTotal > totalNg + 1e-9) {
      skippedOverflow++;
      overflow.push({ reportId:id, ttNg:totalNg, detailTotal, difference:detailTotal-totalNg });
      continue;
    }
    eligible++;
    const rows = [...grouped.entries()].map(([code, quantity]) => ({ reportId:id, defectTypeId:Number(master.get(code).id), code, quantity }));
    plan.push(...rows);
    if (samples.length < 20) samples.push({ reportId:id, ttNg:totalNg, detailTotal, unclassified:Math.max(0,totalNg-detailTotal), rows });
  }

  console.log(JSON.stringify({ mode:APPLY?'APPLY':'DRY_RUN', from:FROM, to:TO, processId, reportCount:reports.length, alreadyHasDetails:skippedExisting, emptyLegacy:skippedEmpty, overflowSkipped:skippedOverflow, eligibleReports:eligible, rowsToInsert:plan.length, overflow:overflow.slice(0,20), samples }, null, 2));

  if (!APPLY) {
    console.log('DRY RUN ONLY. Re-run with --apply after reviewing the summary.');
    return;
  }

  const conn = await new Promise((resolve, reject) => db.getConnection((error, connection) => error ? reject(error) : resolve(connection)));
  try {
    await new Promise((resolve, reject) => conn.beginTransaction(error => error ? reject(error) : resolve()));
    for (const row of plan) {
      await conn.promise().query(
        `INSERT INTO production_report_defects(report_id,defect_type_id,quantity) VALUES (?,?,?)`,
        [row.reportId, row.defectTypeId, row.quantity]
      );
      insertedRows++;
    }
    insertedReports = new Set(plan.map(row => row.reportId)).size;
    await new Promise((resolve, reject) => conn.commit(error => error ? reject(error) : resolve()));
  } catch (error) {
    await new Promise(resolve => conn.rollback(() => resolve()));
    throw error;
  } finally {
    conn.release();
  }

  console.log(JSON.stringify({ applied:true, insertedReports, insertedRows, overflowSkipped:skippedOverflow }, null, 2));
}

main().then(() => process.exit(0)).catch(error => { console.error('[KTC] GC defect migration failed:', error.message); process.exit(1); });
