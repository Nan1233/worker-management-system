const db = require("../config/db");
const approvalModel = require("./productionTempApprovalModel");

const approvalStage = async (name, task) => {
  const started = Date.now();
  console.log(`[KTC][APPROVAL_TRACE] START ${name}`);
  try {
    const result = await task();
    console.log(`[KTC][APPROVAL_TRACE] END ${name} ms=${Date.now() - started}`);
    return result;
  } catch (error) {
    console.error(`[KTC][APPROVAL_TRACE] ERROR ${name} ms=${Date.now() - started} code=${error?.code || ''} message=${String(error?.message || error).slice(0, 300)}`);
    throw error;
  }
};

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
        AND t.status IN ('pending','need_fix')
        AND NOT EXISTS (SELECT 1 FROM production_temp_machine_lines ml WHERE ml.temp_report_id=t.id)`, normalized);
  for (const report of reports || []) {
    // Never synthesize an approved machine line from a comma-separated report:
    // doing so silently drops additional machines/products. Also never manufacture
    // machine hours or maximum output when the source report has no positive time.
    const rawMachineNo = String(report.machine_no || "").trim();
    const rawProductName = String(report.product_name || "").trim();
    const machineCodes = rawMachineNo.split(",").map((value) => value.trim()).filter(Boolean);
    const productCodes = rawProductName.split(",").map((value) => value.trim()).filter(Boolean);
    const machineCode = machineCodes[0] || "";
    const productCode = productCodes[0] || "";
    const actualTime = Number(report.actual_time || 0);
    if (!machineCode || !productCode || machineCodes.length !== 1 || productCodes.length !== 1 || actualTime <= 0) {
      const error = new Error(
        `Báo cáo máy tạm #${report.id} thiếu dòng máy chi tiết hoặc thời gian máy hợp lệ; không tự tạo dòng LEGACY để tránh ghi sai giờ máy/KH. Hãy nhập/xác nhận từng máy, sản phẩm và giờ máy trước khi duyệt.`
      );
      error.status = 409;
      error.code = "LEGACY_MACHINE_LINE_REQUIRES_REVIEW";
      error.isPublic = true;
      throw error;
    }
    // Reports that already have machine lines are filtered out by the NOT EXISTS above (one query for the whole batch).
    let machine = null;
    try {
      const [machines] = await db.promise().query(`SELECT id,machine_code FROM machines WHERE process_id=? AND UPPER(TRIM(machine_code))=UPPER(TRIM(?)) LIMIT 1`, [Number(report.process_id), machineCode]);
      machine = machines?.[0] || null;
    } catch (_) {}
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

// Repair stale machine_id values on existing temporary machine lines before approval.
// Older reports can contain a valid machine_code but an old/wrong machine_id; resolve the
// canonical machine again from the process + machine code so approval can validate the snapshot.
async function repairMachineLineReferences(targets) {
  const ids = [...new Set((Array.isArray(targets) ? targets : [])
    .map((item) => typeof item === "object" ? item?.id : item)
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0))];
  if (!ids.length) return;
  const placeholders = ids.map(() => "?").join(",");
  // Resolve only unambiguous active machines in one joined UPDATE. The previous
  // implementation performed SELECT + UPDATE for every line, exhausting Worker
  // subrequests when a report contained multiple machine lines.
  await db.promise().query(
    `UPDATE production_temp_machine_lines ml
       JOIN production_reports_temp r ON r.id=ml.temp_report_id
       JOIN (
         SELECT process_id, UPPER(TRIM(machine_code)) AS normalized_code,
                MIN(id) AS machine_id, MIN(machine_code) AS machine_code
           FROM machines
          WHERE status='active'
          GROUP BY process_id, UPPER(TRIM(machine_code))
         HAVING COUNT(*)=1
       ) m
         ON m.process_id=r.process_id
        AND m.normalized_code=UPPER(TRIM(
          COALESCE(NULLIF(TRIM(ml.machine_code),''), SUBSTRING_INDEX(r.machine_no,',',1))
        ))
      SET ml.machine_id=m.machine_id,
          ml.machine_code=m.machine_code
      WHERE r.id IN (${placeholders})
        AND r.status IN ('pending','need_fix')
        AND (
          ml.machine_id IS NULL OR ml.machine_id<>m.machine_id
          OR TRIM(COALESCE(ml.machine_code,''))<>TRIM(m.machine_code)
        )`,
    ids,
  );
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
  // Every statement is one Worker subrequest, so candidate events are read once for the whole batch and
  // matched in memory (same rules as the former per-line queries: exact match first, then normalised
  // UPPER(TRIM()) match; exactly one match links, more than one is ambiguous), and all links are written
  // with a single UPDATE.
  const pending = [];
  for (const line of lines || []) {
    if (line.machine_event_id) continue;
    if (String(line.process_code || '').trim().toUpperCase() !== 'GC') continue;
    const machineCode = String(line.machine_code || line.machine_no || '').split(',')[0].trim();
    const productCode = String(line.product_code || line.product_name || '').split(",")[0].trim();
    if (!machineCode || !productCode) continue;
    pending.push({ line, machineCode, productCode, workDate: String(line.work_date).slice(0, 10), shift: String(line.shift || '').trim() });
  }
  if (!pending.length) return;

  const processIds = [...new Set(pending.map((p) => Number(p.line.process_id)))];
  const workDates = [...new Set(pending.map((p) => p.workDate))];
  const [candidateEvents] = await db.promise().query(
    `SELECT id,process_id,machine_id,machine_code,product_code,work_date,shift,status
       FROM machine_production_events
      WHERE status='approved'
        AND process_id IN (${processIds.map(() => "?").join(",")})
        AND work_date IN (${workDates.map(() => "?").join(",")})
      ORDER BY id DESC`,
    [...processIds, ...workDates]);
  const dateKey = (value) => value instanceof Date
    ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`
    : String(value || "").slice(0, 10);
  const norm = (value) => String(value ?? "").trim().toUpperCase();
  const links = [];
  for (const { line, machineCode, productCode, workDate, shift } of pending) {
    const sameSlot = (candidateEvents || []).filter((event) => Number(event.process_id) === Number(line.process_id) && dateKey(event.work_date) === workDate);
    let events = sameSlot.filter((event) => event.machine_code === machineCode && event.product_code === productCode && event.shift === shift).slice(0, 2);
    if (!events.length) {
      events = sameSlot.filter((event) => norm(event.machine_code) === norm(machineCode) && norm(event.product_code) === norm(productCode) && norm(event.shift) === norm(shift)).slice(0, 2);
    }
    if (events.length === 1) {
      links.push({ lineId: Number(line.id), eventId: Number(events[0].id), machineId: Number(events[0].machine_id) || null, machineCode, productCode });
    } else if (events.length > 1) {
      const error = new Error(`Có nhiều production event đã duyệt trùng máy ${machineCode}, sản phẩm ${productCode}, ngày ${workDate}, ca ${shift}; không thể tự xác định event`);
      error.status = 409; error.code = 'AMBIGUOUS_MACHINE_EVENT'; error.isPublic = true; throw error;
    }
  }
  if (!links.length) return;
  // One UPDATE for all links; per-line values are picked with CASE on the line id.
  const caseOf = (column) => `CASE id ${links.map(() => "WHEN ? THEN ?").join(" ")} ELSE ${column} END`;
  const params = [];
  const pairs = (valueOf) => { for (const link of links) params.push(link.lineId, valueOf(link)); };
  pairs((l) => l.eventId);
  const eventParams = params.splice(0);
  pairs((l) => l.machineId);
  const machineIdParams = params.splice(0);
  pairs((l) => l.machineCode);
  const machineCodeParams = params.splice(0);
  pairs((l) => l.productCode);
  const productCodeParams = params.splice(0);
  await db.promise().query(
    `UPDATE production_temp_machine_lines
        SET machine_id=COALESCE(${caseOf("NULL")},machine_id),
            machine_code=COALESCE(NULLIF(TRIM(machine_code),''),${caseOf("NULL")}),
            product_code=COALESCE(NULLIF(TRIM(product_code),''),${caseOf("NULL")}),
            machine_event_id=${caseOf("machine_event_id")}
      WHERE id IN (${links.map(() => "?").join(",")}) AND machine_event_id IS NULL`,
    [...machineIdParams, ...machineCodeParams, ...productCodeParams, ...eventParams, ...links.map((l) => l.lineId)]);
  console.log(`[KTC] Auto-linked ${links.length} approved machine event(s) to temp machine lines`);
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

module.exports = {
  ...approvalModel,
  async approveSelected(targets, reviewerId, isAdmin = false) {
    await approvalStage("ensureLegacyMachineLines", () => ensureLegacyMachineLines(targets));
    await approvalStage("repairMachineLineReferences", () => repairMachineLineReferences(targets));
    await approvalStage("linkMatchingApprovedMachineEvents", () => linkMatchingApprovedMachineEvents(targets));
    return approvalStage("approveSelectedSerialized", () => approveSelectedSerialized(targets, reviewerId, isAdmin));
  },
};