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
        AND t.status IN ('pending','need_fix')`,
    normalized,
  );

  for (const report of reports || []) {
    const machineCode = String(report.machine_no || "").split(",")[0].trim();
    const productCode = String(report.product_name || "").split(",")[0].trim();
    if (!machineCode || !productCode) continue;

    const [existing] = await db.promise().query(
      `SELECT id FROM production_temp_machine_lines WHERE temp_report_id=? LIMIT 1`,
      [Number(report.id)],
    );
    if (existing?.length) continue;

    let machine = null;
    try {
      const [machines] = await db.promise().query(
        `SELECT id,machine_code FROM machines
          WHERE process_id=?
            AND UPPER(TRIM(machine_code))=UPPER(TRIM(?))
          LIMIT 1`,
        [Number(report.process_id), machineCode],
      );
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
          defects_json,sort_order)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          Number(report.id),
          null,
          machine ? Number(machine.id) : null,
          machine?.machine_code || machineCode,
          null,
          report.standard_version_id || null,
          report.machine_standard_id || null,
          productCode,
          actualTime,
          standardOutput,
          null,
          "LEGACY",
          Number(report.exclude_kqd_from_tt_snapshot || 0) === 1 ? 1 : 0,
          Number(report.tt_ok || 0),
          Number(report.tt_ng || 0),
          maxOutput,
          actualOutput,
          earnedStandardHours,
          "[]",
          1,
        ],
      );
    } catch (error) {
      console.warn(`[KTC] Legacy machine-line backfill skipped for temp #${report.id}: ${error.message}`);
    }
  }
}

async function withApprovalLocks(targets, task) {
  const ids = [...new Set(
    (Array.isArray(targets) ? targets : [])
      .map((item) => typeof item === "object" ? item?.id : item)
      .map(Number)
      .filter((id) => Number.isInteger(id) && id > 0),
  )].sort((a, b) => a - b);

  if (!ids.length) return task();

  // TiDB supports session-level GET_LOCK(). Serialize approvals for the same
  // temp report before the long approval transaction starts. This prevents
  // two manager requests from racing on production_reports.source_temp_id and
  // turning a normal double-click/concurrent request into Error 1205.
  const connection = await db.promise().getConnection();
  const acquired = [];

  try {
    for (const id of ids) {
      const lockName = `ktc:approve-temp:${id}`;
      const [rows] = await connection.query("SELECT GET_LOCK(?, 1) AS acquired", [lockName]);
      if (Number(rows?.[0]?.acquired) !== 1) {
        const error = new Error(`Báo cáo #${id} đang được xử lý bởi một yêu cầu duyệt khác. Vui lòng thử lại sau.`);
        error.status = 409;
        error.code = "APPROVAL_IN_PROGRESS";
        throw error;
      }
      acquired.push(lockName);
    }

    return await task();
  } finally {
    for (let index = acquired.length - 1; index >= 0; index -= 1) {
      try {
        await connection.query("SELECT RELEASE_LOCK(?) AS released", [acquired[index]]);
      } catch (error) {
        console.warn(`[KTC] Failed to release approval lock ${acquired[index]}: ${error.message}`);
      }
    }
    connection.release();
  }
}

module.exports = {
  ...approvalModel,
  async approveSelected(targets, reviewerId, isAdmin = false) {
    return withApprovalLocks(targets, async () => {
      await ensureLegacyMachineLines(targets);
      return approvalModel.approveSelected(targets, reviewerId, isAdmin);
    });
  },
};
