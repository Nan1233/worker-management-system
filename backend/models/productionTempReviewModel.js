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

module.exports = {
  ...approvalModel,
  async approveSelected(targets, reviewerId, isAdmin = false) {
    // Do not use GET_LOCK() here. TiDB session locks can outlive the
    // application-side connection wrapper when a Cloudflare Worker request is
    // terminated, which can make a healthy retry fail with a false 409.
    // The approval transaction/status checks remain the source of truth.
    await ensureLegacyMachineLines(targets);
    return approvalModel.approveSelected(targets, reviewerId, isAdmin);
  },
};