const db = require("../config/db");
const approvalModel = require("./productionTempApprovalModel");

async function ensureLegacyMachineLines(targets) {
  const normalized = (Array.isArray(targets) ? targets : [])
    .map((item) => typeof item === "object" ? item : { id: item })
    .map((item) => Number(item?.id))
    .filter((id) => Number.isInteger(id) && id > 0);
  if (!normalized.length) return;
  const placeholders = normalized.map(() => "?").join(",");
  const [reports] = await db.promise().query(
    `SELECT t.id,t.process_id,t.operation_mode,t.machine_no,t.product_name,
            t.actual_time,t.standard_output,t.standard_version_id,t.machine_standard_id,
            t.exclude_kqd_from_tt_snapshot,t.actual_output,t.tt_ok,t.tt_ng
       FROM production_reports_temp t
      WHERE t.id IN (${placeholders})
        AND UPPER(COALESCE(t.operation_mode,''))='MACHINE'
        AND t.status IN ('pending','need_fix')`, normalized);
  for (const report of reports || []) {
    const machineCode = String(report.machine_no || "").split(",")[0].trim();
    const productCode = String(report.product_name || "").split(",")[0].trim();
    if (!machineCode || !productCode) continue;
    const [existing] = await db.promise().query(`SELECT id FROM production_temp_machine_lines WHERE temp_report_id=? LIMIT 1`, [Number(report.id)]);
    if (existing?.length) continue;
    let machine = null;
    try {
      const [machines] = await db.promise().query(`SELECT id,machine_code FROM machines WHERE process_id=? AND UPPER(TRIM(machine_code))=UPPER(TRIM(?)) LIMIT 1`, [Number(report.process_id), machineCode]);
      machine = machines?.[0] || null;
    } catch (_) {}
    const actualTime = Number(report.actual_time || 0);
    const standardOutput = Number(report.standard_output || 0);
    const actualOutput = Number(report.actual_output || 0);
    const maxOutput = standardOutput > 0 && actualTime > 0 ? standardOutput * actualTime : 0;
    const earnedStandardHours = standardOutput > 0 ? actualOutput / standardOutput : 0;
    try {
      await db.promise().query(
        `INSERT INTO production_temp_machine_lines
         (temp_report_id,machine_event_id,machine_id,machine_code,product_standard_id,
          standard_version_id,machine_standard_id,product_code,machine_time_hours,
          standard_output,standard_time_seconds,standard_source,exclude_kqd_from_tt,
          ok_quantity,ng_quantity,maximum_output,counted_output,earned_standard_hours,
          defects_json,sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [Number(report.id),null,machine ? Number(machine.id) : null,machine?.machine_code || machineCode,null,
         report.standard_version_id || null,report.machine_standard_id || null,productCode,actualTime,standardOutput,null,"LEGACY",
         Number(report.exclude_kqd_from_tt_snapshot || 0) === 1 ? 1 : 0,Number(report.tt_ok || 0),Number(report.tt_ng || 0),maxOutput,actualOutput,earnedStandardHours,"[]",1]);
    } catch (error) { console.warn(`[KTC] Legacy machine-line backfill skipped for temp #${report.id}: ${error.message}`); }
  }
}

async function linkMatchingApprovedMachineEvents(targets) {
  const ids = (Array.isArray(targets) ? targets : [])
    .map((item) => typeof item === "object" ? item?.id : item).map(Number)
    .filter((id) => Number.isInteger(id) && id > 0);
  if (!ids.length) return;
  const placeholders = ids.map(() => "?").join(",");
  const [lines] = await db.promise().query(
    `SELECT ml.id,ml.machine_event_id,ml.machine_id,ml.machine_code,ml.product_code,
            r.process_id,r.work_date,r.shift,r.machine_no,r.product_name,p.process_code
       FROM production_temp_machine_lines ml
       JOIN production_reports_temp r ON r.id=ml.temp_report_id
       JOIN processes p ON p.id=r.process_id
      WHERE r.id IN (${placeholders}) AND r.status IN ('pending','need_fix')
        AND UPPER(COALESCE(r.operation_mode,''))='MACHINE'`, ids);
  for (const line of lines || []) {
    if (line.machine_event_id) continue;
    if (String(line.process_code || '').trim().toUpperCase() !== 'GC') continue;
    const machineCode = String(line.machine_code || line.machine_no || '').split(',')[0].trim();
    const productCode = String(line.product_code || line.product_name || '').split(',')[0].trim();
    if (!machineCode || !productCode) continue;

    const [events] = await db.promise().query(
      `SELECT id,process_id,machine_id,machine_code,product_code,work_date,shift,status
         FROM machine_production_events
        WHERE status='approved' AND process_id=?
          AND UPPER(TRIM(machine_code))=UPPER(TRIM(?))
          AND UPPER(TRIM(product_code))=UPPER(TRIM(?))
          AND work_date=? AND UPPER(TRIM(shift))=UPPER(TRIM(?))
        ORDER BY id DESC LIMIT 2`,
      [Number(line.process_id),machineCode,productCode,String(line.work_date).slice(0,10),String(line.shift || '').trim()]);
    if (events?.length === 1) {
      await db.promise().query(
        `UPDATE production_temp_machine_lines
            SET machine_event_id=?,
                machine_id=COALESCE(?,machine_id),
                machine_code=COALESCE(NULLIF(TRIM(machine_code),''),?),
                product_code=COALESCE(NULLIF(TRIM(product_code),''),?)
          WHERE id=? AND machine_event_id IS NULL`,
        [Number(events[0].id),Number(events[0].machine_id) || null,machineCode,productCode,Number(line.id)]);
      console.log(`[KTC] Auto-linked approved machine event #${events[0].id} to temp machine line #${line.id}`);
    } else if (events?.length > 1) {
      const error = new Error(`Có nhiều production event đã duyệt trùng máy ${machineCode}, sản phẩm ${productCode}, ngày ${String(line.work_date).slice(0,10)}, ca ${String(line.shift || '').trim()}; không thể tự xác định event`);
      error.status = 409; error.code = 'AMBIGUOUS_MACHINE_EVENT'; error.isPublic = true; throw error;
    }
  }
}

const approvalQueues = new Map();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isLockWaitTimeout = (error) => Number(error?.errno) === 1205 || /lock wait timeout exceeded|error 1205/i.test(String(error?.message || ""));

function approvalQueueKey(targets) {
  return [...new Set((Array.isArray(targets) ? targets : [])
    .map((item) => typeof item === "object" ? item?.id : item)
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0))]
    .sort((a, b) => a - b)
    .join(",");
}

async function loadAlreadyApproved(reportIds) {
  const ids = [...new Set((Array.isArray(reportIds) ? reportIds : []).map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  if (!ids.length) return null;
  const placeholders = ids.map(() => "?").join(",");
  const [rows] = await db.promise().query(
    `SELECT id,source_temp_id,work_date FROM production_reports
      WHERE source_temp_id IN (${placeholders})
      ORDER BY source_temp_id,id DESC`, ids);
  const byTemp = new Map();
  for (const row of rows || []) {
    const key = Number(row.source_temp_id);
    if (!byTemp.has(key)) byTemp.set(key, row);
  }
  if (byTemp.size !== ids.length) return null;
  const approvedIds = ids.map((id) => Number(byTemp.get(id).id));
  const dates = [...new Set(ids.map((id) => {
    const value = byTemp.get(id).work_date;
    return value instanceof Date
      ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`
      : String(value || "").slice(0, 10);
  }).filter(Boolean))];
  return { count: ids.length, temp_ids: ids, approved_ids: approvedIds, dates };
}

async function approveSelectedSerialized(targets, reviewerId, isAdmin) {
  const key = approvalQueueKey(targets);
  const previous = approvalQueues.get(key) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  approvalQueues.set(key, current);
  await previous;
  try {
    const reportIds = [...new Set((Array.isArray(targets) ? targets : [])
      .map((item) => typeof item === "object" ? item?.id : item)
      .map(Number)
      .filter((id) => Number.isInteger(id) && id > 0))];

    const alreadyApproved = await loadAlreadyApproved(reportIds);
    if (alreadyApproved) return alreadyApproved;

    for (const delay of [0, 250, 750]) {
      if (delay) await sleep(delay);
      try {
        return await approvalModel.approveSelected(targets, reviewerId, isAdmin);
      } catch (error) {
        if (!isLockWaitTimeout(error)) throw error;
        const recovered = await loadAlreadyApproved(reportIds);
        if (recovered) return recovered;
      }
    }
    const error = new Error("Yêu cầu duyệt báo cáo đang bị yêu cầu khác xử lý. Vui lòng thử lại.");
    error.status = 409;
    error.code = "APPROVAL_CONCURRENT_CONFLICT";
    error.isPublic = true;
    throw error;
  } finally {
    release();
    if (approvalQueues.get(key) === current) approvalQueues.delete(key);
  }
}

async function withDbApprovalProcessLocks(targets, task) {
  const ids = [...new Set((Array.isArray(targets) ? targets : [])
    .map((item) => typeof item === "object" ? item?.id : item)
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0))];
  if (!ids.length) return task();

  const connection = await db.promise().getConnection();
  try {
    await connection.beginTransaction();
    const placeholders = ids.map(() => "?").join(",");
    // Cloudflare Workers can execute different requests in different isolates,
    // so the in-memory queue above is not a database-wide mutex. Lock the
    // process rows first, before any temp-machine-line or production-report
    // locks are taken by the approval transaction. Every approval request for
    // the same process therefore enters the critical section in one order.
    await connection.query(
      `SELECT id FROM processes
        WHERE id IN (
          SELECT DISTINCT process_id FROM production_reports_temp WHERE id IN (${placeholders})
        )
        ORDER BY id ASC
        FOR UPDATE`,
      ids,
    );
    const result = await task();
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  ...approvalModel,
  async approveSelected(targets, reviewerId, isAdmin = false) {
    return withDbApprovalProcessLocks(targets, async () => {
      await ensureLegacyMachineLines(targets);
      await linkMatchingApprovedMachineEvents(targets);
      return approveSelectedSerialized(targets, reviewerId, isAdmin);
    });
  },
};