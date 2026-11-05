#!/usr/bin/env node
"use strict";

/**
 * One-off repair for legacy grouped Mài report 1470013.
 *
 * Safe by default: without --apply this only prints the planned split.
 * Run from backend/ with DB environment configured:
 *   node scripts/split_legacy_mai_report_1470013.js
 *   REPORT_AUDIT_USER_ID=<valid app user id> node scripts/split_legacy_mai_report_1470013.js --apply
 *
 * The application submission service creates child reports and their audit records.
 * The source report is moved to rejected only after all three child reports exist.
 */
const db = require("../config/db");
const { createCompleteReport } = require("../services/productionTempSubmissionService");

const SOURCE_ID = 1470013;
const EXPECTED = [
  { machine: "18", product: "5120-2", lineId: 1440031 },
  { machine: "18", product: "6900-1", lineId: 1440032 },
  { machine: "13", product: "8UM-2", lineId: 1440033 },
];
const APPLY = process.argv.includes("--apply");

const parseJson = (value, fallback = []) => {
  if (Array.isArray(value)) return value;
  if (!value) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
};
const num = (value) => Number(value || 0);

async function main() {
  const conn = await db.promise().getConnection();
  try {
    const [parents] = await conn.query(
      "SELECT * FROM production_reports_temp WHERE id=? FOR UPDATE",
      [SOURCE_ID]
    );
    const parent = parents[0];
    if (!parent) throw new Error(`Không tìm thấy báo cáo nguồn ${SOURCE_ID}`);
    if (parent.status !== "pending") throw new Error(`Báo cáo nguồn không còn pending (status=${parent.status})`);

    const [lines] = await conn.query(
      "SELECT * FROM production_temp_machine_lines WHERE temp_report_id=? ORDER BY sort_order,id",
      [SOURCE_ID]
    );
    if (lines.length !== 3) throw new Error(`Cần đúng 3 dòng máy, hiện có ${lines.length}`);

    for (let i = 0; i < EXPECTED.length; i += 1) {
      const expected = EXPECTED[i];
      const line = lines[i];
      if (String(line.id) !== String(expected.lineId)
        || String(line.machine_code) !== expected.machine
        || String(line.product_code) !== expected.product) {
        throw new Error(`Dòng máy thứ ${i + 1} không khớp dữ liệu đã kiểm tra`);
      }
    }

    const [alreadyCreated] = await conn.query(
      "SELECT id,status,machine_no,product_name FROM production_reports_temp WHERE worker_id=? AND process_id=? AND work_date=? AND shift=? AND id<>? AND status IN ('pending','need_fix')",
      [parent.worker_id, parent.process_id, parent.work_date, parent.shift, SOURCE_ID]
    );
    if (alreadyCreated.length) {
      throw new Error("Đã có báo cáo pending/need_fix cùng công nhân, công đoạn, ngày, ca. Dừng để tránh tạo trùng: " + JSON.stringify(alreadyCreated));
    }

    const processRows = await conn.query("SELECT process_code FROM processes WHERE id=? LIMIT 1", [parent.process_id]);
    if (String(processRows[0]?.[0]?.process_code || "").toUpperCase() !== "MAI") {
      throw new Error("Báo cáo nguồn không thuộc công đoạn MAI");
    }

    const machineLines = lines.map((line) => ({
      machine_id: line.machine_id,
      machine_code: line.machine_code,
      product_standard_id: line.product_standard_id,
      product_code: line.product_code,
      machine_time_hours: num(line.machine_time_hours),
      standard_output: num(line.standard_output),
      standard_time_seconds: num(line.standard_time_seconds),
      standard_version_id: line.standard_version_id,
      machine_standard_id: line.machine_standard_id,
      standard_source: line.standard_source,
      exclude_kqd_from_tt: num(line.exclude_kqd_from_tt),
      ok_quantity: num(line.ok_quantity),
      ng_quantity: num(line.ng_quantity),
      maximum_output: num(line.maximum_output),
      deduction_time_hours: num(line.deduction_time_hours),
      deductions: parseJson(line.deductions_json, []).map((item) => ({
        deduction_type_id: num(item.deduction_type_id),
        deduction_name: item.deduction_name,
        hours: num(item.hours),
      })),
      defects: parseJson(line.defects_json, []),
      counted_output: num(line.counted_output),
      earned_standard_hours: num(line.earned_standard_hours),
      adjustment_minutes: num(line.adjustment_minutes),
      adjustment_count: num(line.adjustment_count),
    }));

    const auditUserId = Number(process.env.REPORT_AUDIT_USER_ID || parent.updated_by || 0);
    if (APPLY && (!Number.isInteger(auditUserId) || auditUserId <= 0)) {
      throw new Error("Thiếu REPORT_AUDIT_USER_ID hợp lệ để ghi audit. Chưa có dữ liệu nào được thay đổi.");
    }

    const totals = machineLines.reduce((acc, line) => ({
      ok: acc.ok + line.ok_quantity,
      ng: acc.ng + line.ng_quantity,
      machineHours: acc.machineHours + line.machine_time_hours,
      deductions: acc.deductions + line.deduction_time_hours,
    }), { ok: 0, ng: 0, machineHours: 0, deductions: 0 });

    console.log(JSON.stringify({
      mode: APPLY ? "APPLY" : "DRY_RUN",
      source: SOURCE_ID,
      sourceStatus: parent.status,
      plannedReports: machineLines.map((line) => ({
        machine: line.machine_code,
        product: line.product_code,
        machineHours: line.machine_time_hours,
        deductionHours: line.deduction_time_hours,
        ok: line.ok_quantity,
        ng: line.ng_quantity,
      })),
      totals,
    }, null, 2));

    if (!APPLY) return;

    const requestId = `legacy-split-${SOURCE_ID}-${Date.now()}`;
    const result = await createCompleteReport({
      data: {
        worker_id: parent.worker_id,
        process_id: parent.process_id,
        process_code: "MAI",
        work_date: parent.work_date,
        entry_date: parent.entry_date,
        shift: parent.shift,
        operation_type: parent.operation_type,
        operation_mode: parent.operation_mode,
        machine_no: parent.machine_no,
        product_name: parent.product_name,
        total_time: parent.total_time,
        actual_time: parent.actual_time,
        deduction_time: parent.deduction_time,
        standard_output: parent.standard_output,
        standard_version_id: parent.standard_version_id,
        machine_standard_id: parent.machine_standard_id,
        training_percent_snapshot: parent.training_percent_snapshot,
        actual_output: parent.actual_output,
        tt_ok: parent.tt_ok,
        tt_ng: parent.tt_ng,
        note: parent.note,
        extra_data: { ...parseJson(parent.extra_data, {}), legacy_split_from_report_id: SOURCE_ID },
        client_request_id: requestId,
      },
      machineLines,
      audit: {
        userId: auditUserId,
        note: `Tách báo cáo gộp cũ #${SOURCE_ID} thành báo cáo riêng theo từng sản phẩm/máy`,
      },
    });

    if (!Array.isArray(result.ids) || result.ids.length !== 3) {
      throw new Error("Service không trả về đủ 3 báo cáo con; giữ nguyên báo cáo nguồn. Kết quả: " + JSON.stringify(result));
    }

    const [verify] = await conn.query(
      "SELECT id,status,worker_id,process_id,work_date,shift,actual_output,tt_ok,tt_ng FROM production_reports_temp WHERE id IN (?,?,?) ORDER BY id",
      result.ids
    );
    if (verify.length !== 3 || verify.reduce((s, r) => s + num(r.tt_ok), 0) !== num(parent.tt_ok)
      || verify.reduce((s, r) => s + num(r.tt_ng), 0) !== num(parent.tt_ng)
      || verify.reduce((s, r) => s + num(r.actual_output), 0) !== num(parent.actual_output)) {
      throw new Error("Kiểm tra tổng sau khi tạo không khớp. Báo cáo nguồn vẫn được giữ pending; báo cáo con cần kiểm tra thủ công: " + JSON.stringify(verify));
    }

    await conn.beginTransaction();
    try {
      const [locked] = await conn.query("SELECT id,status FROM production_reports_temp WHERE id=? FOR UPDATE", [SOURCE_ID]);
      if (!locked[0] || locked[0].status !== "pending") throw new Error("Trạng thái báo cáo nguồn đã thay đổi, không tự động thay thế");
      await conn.query(
        "UPDATE production_reports_temp SET status='rejected', review_note=? WHERE id=? AND status='pending'",
        [`Đã tách thành các báo cáo riêng: ${result.ids.join(", ")}. Bản ghi cũ được giữ để đối chiếu.`, SOURCE_ID]
      );
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    }

    console.log("SUCCESS: created child report IDs:", result.ids.join(", "));
  } finally {
    conn.release();
    if (typeof db.closePool === "function") await db.closePool();
  }
}

main().catch((error) => {
  console.error("FAILED:", error.message);
  process.exitCode = 1;
});
