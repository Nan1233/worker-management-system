const db = require("../config/db");
const approvalModel = require("./productionTempApprovalModel");
const { getProcessMachinePolicy } = require("../services/processMachinePolicy");

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
    const policy = getProcessMachinePolicy(report.process_id);

    // CVK is genuinely non-machine and must never be backfilled here.
    // GC shared-machine reports also must keep the production-event requirement.
    if (policy.code === "CVK" || policy.code === "GC") continue;

    const machineCode = String(report.machine_no || "").split(",")[0].trim();
    const productCode = String(report.product_name || "").split(",")[0].trim();

    // This compatibility path is ONLY for old MACHINE reports that already
    // contain the complete parent-level machine/product snapshot but lost their
    // child machine-line row. New reports are created with child lines and never
    // enter this path.
    if (!machineCode || !productCode || Number(report.standard_output || 0) <= 0) continue;

    const [existing] = await db.promise().query(
      `SELECT id FROM production_temp_machine_lines WHERE temp_report_id=? LIMIT 1`,
      [Number(report.id)],
    );
    if (existing?.length) continue;

    const [machines] = await db.promise().query(
      `SELECT id,machine_code FROM machines
        WHERE process_id=? AND status='active'
          AND UPPER(TRIM(machine_code))=UPPER(TRIM(?))
        LIMIT 1`,
      [Number(report.process_id), machineCode],
    );
    const machine = machines?.[0];
    if (!machine) continue;

    const actualTime = Number(report.actual_time || 0);
    const standardOutput = Number(report.standard_output || 0);
    const actualOutput = Number(report.actual_output || 0);
    const maxOutput = standardOutput > 0 && actualTime > 0 ? standardOutput * actualTime : 0;
    const earnedStandardHours = standardOutput > 0 ? actualOutput / standardOutput : 0;

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
        Number(machine.id),
        machine.machine_code,
        null,
        report.standard_version_id || null,
        report.machine_standard_id || null,
        productCode,
        actualTime,
        standardOutput,
        null,
        "LEGACY_PARENT_SNAPSHOT",
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
  }
}

module.exports = {
  ...approvalModel,
  async approveSelected(targets, reviewerId, isAdmin = false) {
    await ensureLegacyMachineLines(targets);
    return approvalModel.approveSelected(targets, reviewerId, isAdmin);
  },
};
