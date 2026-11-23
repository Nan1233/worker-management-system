'use strict';
const db = require('../config/db');
const { query } = require('../models/productionTempModelShared');
const { buildApprovalScopeQuery } = require('../models/productionTempApprovalQueries');
const { assertApprovalSelectionVisible, assertApprovalSelectionVersions } = require('../models/productionTempApprovalSelection');

// Preflight permission and version checks before non-transactional legacy
// repair. The approval transaction repeats both checks before committing.
async function assertLegacyRepairAuthorized(reportIds, expectedById, reviewerId, isAdmin) {
  const { sql, params } = buildApprovalScopeQuery(reportIds, reviewerId, isAdmin);
  const scopedSql = sql.replace(/\\s+FOR\\s+UPDATE\\s*$/i, '');
  const [rows] = await db.promise().query(scopedSql, params);
  assertApprovalSelectionVisible(rows || [], reportIds);
  assertApprovalSelectionVersions(rows || [], expectedById);
}

// Match mysql2's [rows] contract while keeping every repair statement on
// the caller's transaction connection. A missing connection is not allowed.
async function transactionQuery(connection, sql, params = []) {
  if (!connection) throw new Error('Legacy machine repair requires an active approval transaction');
  return [await query(connection, sql, params)];
}

// Persistence adapter for legacy machine repair and idempotent approval recovery.
async function ensureLegacyMachineLines(targets, createResolver, connection) {
  if (typeof createResolver !== 'function') throw new TypeError('Legacy machine backfill requires a standard resolver');
  const normalized = (Array.isArray(targets) ? targets : [])
    .map((item) => typeof item === "object" ? item : { id: item })
    .map((item) => Number(item?.id))
    .filter((id) => Number.isInteger(id) && id > 0);
  if (!normalized.length) return;
  const placeholders = normalized.map(() => "?").join(",");
  const [reports] = await transactionQuery(connection, 
    `SELECT t.id,t.process_id,t.work_date,t.operation_type,t.operation_mode,t.machine_no,t.product_name,
            t.actual_time,t.standard_output,t.standard_version_id,t.machine_standard_id,
            t.actual_output,t.tt_ok,t.tt_ng,
            UPPER(TRIM(COALESCE(p.process_code,''))) AS process_code,
            t.extra_data
       FROM production_reports_temp t
       LEFT JOIN processes p ON p.id=t.process_id
      WHERE t.id IN (${placeholders})
        AND UPPER(COALESCE(t.operation_mode,''))='MACHINE'
        AND UPPER(TRIM(COALESCE(p.process_code,''))) NOT IN ('CVK','XLBV','SX3')
        AND t.process_id NOT IN (30002,60006)
        AND t.status IN ('pending','need_fix')
        AND NOT EXISTS (SELECT 1 FROM production_temp_machine_lines ml WHERE ml.temp_report_id=t.id)`, normalized);
  for (const report of reports || []) {
    const rawMachine = String(report.machine_no || "").trim();
    const rawProduct = String(report.product_name || "").trim();
    // A legacy report may encode multiple machines/products in comma-separated fields.
    // Never silently backfill only the first item: that loses machine-level attribution.
    const machineParts = rawMachine.split(",").map((value) => value.trim()).filter(Boolean);
    const productParts = rawProduct.split(",").map((value) => value.trim()).filter(Boolean);
    if (machineParts.length !== 1 || productParts.length !== 1) {
      const error = new Error(`Báo cáo máy #${report.id} có nhiều máy/sản phẩm hoặc dữ liệu chưa rõ; cần kiểm tra trước khi duyệt.`);
      error.status = 409;
      error.code = "LEGACY_MACHINE_LINE_REQUIRES_REVIEW";
      error.isPublic = true;
      throw error;
    }
    const machineCode = machineParts[0] || "";
    const productCode = productParts[0] || "";
    if (!machineCode || !productCode) {
      const error = new Error(`Báo cáo máy #${report.id} thiếu mã máy hoặc mã sản phẩm; không thể tự tạo dòng máy an toàn. Hãy bổ sung dữ liệu nguồn rồi thử duyệt lại.`);
      error.status = 409;
      error.code = "LEGACY_MACHINE_LINE_REQUIRES_REVIEW";
      error.isPublic = true;
      throw error;
    }
    const actualTime = Number(report.actual_time || 0);
    if (!Number.isFinite(actualTime) || actualTime <= 0 || actualTime > 12) {
      const error = new Error(`Báo cáo máy #${report.id} thiếu giờ máy hợp lệ (0–12 giờ); cần kiểm tra trước khi duyệt.`);
      error.status = 409;
      error.code = "LEGACY_MACHINE_LINE_REQUIRES_REVIEW";
      error.isPublic = true;
      throw error;
    }
    // Reports that already have machine lines are filtered out by the NOT EXISTS above (one query for the whole batch).
    let machine = null;
    try {
      const [machines] = await transactionQuery(connection, `SELECT id,machine_code,gc_work_type FROM machines WHERE process_id=? AND status='active' AND UPPER(TRIM(machine_code))=UPPER(TRIM(?)) LIMIT 2`, [Number(report.process_id), machineCode]);
      if ((machines || []).length !== 1) {
        const error = new Error(`Mã máy ${machineCode} của báo cáo #${report.id} không khớp duy nhất với máy đang hoạt động trong công đoạn; cần kiểm tra danh mục máy.`);
        error.status = 409;
        error.code = "LEGACY_MACHINE_LINE_REQUIRES_REVIEW";
        error.isPublic = true;
        throw error;
      }
      machine = machines[0];
    } catch (cause) {
      if (cause?.code === "LEGACY_MACHINE_LINE_REQUIRES_REVIEW") throw cause;
      console.error(`[KTC] Machine lookup failed for temp #${report.id}: ${cause.message}`);
      const error = new Error(`Không thể xác minh mã máy của báo cáo #${report.id}; chưa duyệt báo cáo để tránh sai dữ liệu.`);
      error.status = 409;
      error.code = "LEGACY_MACHINE_LINE_BACKFILL_FAILED";
      error.isPublic = true;
      error.cause = cause;
      throw error;
    }
    // Resolve the canonical standard from the active machine + product + work date.
    // Never copy the parent report's possibly stale standard into a synthetic machine line.
    // The resolver also rejects a CUT/NEST operation that conflicts with machines.gc_work_type.
    let resolved;
    try {
      const resolver = createResolver();
      resolved = await resolver.resolveStandard({
        processId: Number(report.process_id),
        productCode,
        machineId: Number(machine.id),
        machineCode: machine.machine_code,
        workDate: report.work_date,
        // For machine reports, the machine master is the source of truth for Cắt/Lồng.
        // Imported legacy operation_type can be wrong (e.g. ML* machine stored as CUT).
        // Omit the report's explicit type here so resolveStandard derives it from machines.gc_work_type.
        workType: null,
      });
    } catch (cause) {
      if (cause?.code === "GC_WORK_TYPE_MISMATCH" || cause?.code === "GC_WORK_TYPE_UNRESOLVED"
          || cause?.code === "STANDARD_EFFECTIVE_RANGE_CONFLICT" || cause?.code === "PRODUCT_ALIAS_CONFLICT"
          || cause?.code === "HISTORICAL_STANDARD_NOT_FOUND" || cause?.code === "STANDARD_WORK_TYPE_MISMATCH"
          || cause?.code === "MACHINE_NOT_FOUND") {
        const error = new Error(`Không thể tự khôi phục dòng máy cho báo cáo #${report.id}: ${cause.message}. Cần sửa dữ liệu nguồn trước khi duyệt.`);
        error.status = 409;
        error.code = "LEGACY_MACHINE_LINE_REQUIRES_REVIEW";
        error.isPublic = true;
        error.cause = cause;
        throw error;
      }
      throw cause;
    }
    const standardOutput = Number(resolved?.standardOutput || 0);
    if (!Number.isFinite(standardOutput) || standardOutput <= 0) {
      const error = new Error(`Không xác minh được định mức cho báo cáo #${report.id}; cần kiểm tra dữ liệu nguồn trước khi duyệt.`);
      error.status = 409;
      error.code = "LEGACY_MACHINE_LINE_REQUIRES_REVIEW";
      error.isPublic = true;
      throw error;
    }
    const actualOutput = Number(report.actual_output || 0);
    const maxOutput = standardOutput * actualTime;
    const earnedStandardHours = actualOutput / standardOutput;
    try {
      await transactionQuery(connection, 
        `INSERT INTO production_temp_machine_lines
         (temp_report_id,machine_event_id,machine_id,machine_code,product_standard_id,
          standard_version_id,machine_standard_id,product_code,machine_time_hours,
          standard_output,standard_time_seconds,standard_source,
          ok_quantity,ng_quantity,maximum_output,counted_output,earned_standard_hours,
          defects_json,sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [Number(report.id),null,Number(machine.id),machine.machine_code, resolved.productStandardId || null,
         resolved.standardVersionId || null,resolved.machineStandardId || null,productCode,actualTime,standardOutput,
         resolved.standardTimeSeconds || null,resolved.source || "LEGACY",
         Number(report.tt_ok || 0),Number(report.tt_ng || 0),
         maxOutput,actualOutput,earnedStandardHours,"[]",1]);
    } catch (cause) {
      console.error(`[KTC] Legacy machine-line backfill failed for temp #${report.id}: ${cause.message}`);
      const error = new Error(`Không thể khôi phục dòng máy cho báo cáo #${report.id}; chưa duyệt báo cáo để tránh sai dữ liệu.`);
      error.status = 409;
      error.code = "LEGACY_MACHINE_LINE_BACKFILL_FAILED";
      error.isPublic = true;
      error.cause = cause;
      throw error;
    }
  }
}

// Repair stale machine_id values on existing temporary machine lines before approval.
// Older reports can contain a valid machine_code but an old/wrong machine_id; resolve the
// canonical machine again from the process + machine code so approval can validate the snapshot.
async function repairMachineLineReferences(targets, connection) {
  const ids = [...new Set((Array.isArray(targets) ? targets : [])
    .map((item) => typeof item === "object" ? item?.id : item)
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0))];
  if (!ids.length) return;
  const placeholders = ids.map(() => "?").join(",");
  // Resolve only unambiguous active machines in one joined UPDATE. The previous
  // implementation performed SELECT + UPDATE for every line, exhausting Worker
  // subrequests when a report contained multiple machine lines.
  await transactionQuery(connection, 
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

async function linkMatchingApprovedMachineEvents(targets, connection) {
  const ids = (Array.isArray(targets) ? targets : [])
    .map((item) => typeof item === "object" ? item?.id : item).map(Number)
    .filter((id) => Number.isInteger(id) && id > 0);
  if (!ids.length) return;
  const placeholders = ids.map(() => "?").join(",");
  const [lines] = await transactionQuery(connection, 
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
  const [candidateEvents] = await transactionQuery(connection, 
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
  await transactionQuery(connection, 
    `UPDATE production_temp_machine_lines
        SET machine_id=COALESCE(${caseOf("NULL")},machine_id),
            machine_code=COALESCE(NULLIF(TRIM(machine_code),''),${caseOf("NULL")}),
            product_code=COALESCE(NULLIF(TRIM(product_code),''),${caseOf("NULL")}),
            machine_event_id=${caseOf("machine_event_id")}
      WHERE id IN (${links.map(() => "?").join(",")}) AND machine_event_id IS NULL`,
    [...machineIdParams, ...machineCodeParams, ...productCodeParams, ...eventParams, ...links.map((l) => l.lineId)]);
  console.log(`[KTC] Auto-linked ${links.length} approved machine event(s) to temp machine lines`);
}

async function loadAlreadyApproved(reportIds, reviewerId, isAdmin = false) {
  const ids = [...new Set((Array.isArray(reportIds) ? reportIds : []).map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))];
  if (!ids.length) return null;
  const placeholders = ids.map(() => "?").join(",");
  const scopeJoin = isAdmin ? '' : 'JOIN manager_processes mp ON mp.process_id = approved.process_id AND mp.manager_id = ?';
  const params = isAdmin ? ids : [reviewerId, ...ids];
  const [rows] = await db.promise().query(
    `SELECT DISTINCT approved.id,approved.source_temp_id,approved.work_date
       FROM production_reports approved
       ${scopeJoin}
      WHERE approved.source_temp_id IN (${placeholders}) AND approved.status='approved'
      ORDER BY approved.source_temp_id,approved.id DESC`, params);
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

module.exports = { assertLegacyRepairAuthorized, ensureLegacyMachineLines, repairMachineLineReferences, linkMatchingApprovedMachineEvents, loadAlreadyApproved };
