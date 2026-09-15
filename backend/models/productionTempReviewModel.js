const db = require("../config/db");
const approvalModel = require("./productionTempApprovalModel");
const { createStandardResolver } = require("../services/standardResolutionService");

function sameStandardOutput(a, b) {
  const left = Number(a);
  const right = Number(b);
  return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= 0.000001;
}

async function hydrateLegacyMachineLineSnapshot(report, line) {
  if (!line || (Number(line.standard_version_id || 0) > 0 && Number(line.machine_standard_id || 0) > 0)) {
    return;
  }

  const productCode = String(line.product_code || report.product_name || "").split(",")[0].trim();
  if (!productCode) return;

  const storedOutput = Number(line.standard_output || 0);
  if (!Number.isFinite(storedOutput) || storedOutput <= 0) return;

  const resolver = createStandardResolver();

  try {
    const resolvedMachine = await resolver.resolveStandard({
      processId: report.process_id,
      productCode,
      machineId: line.machine_id,
      machineCode: line.machine_code,
      workDate: report.work_date,
    });

    if (sameStandardOutput(storedOutput, resolvedMachine.standardOutput)) {
      await db.promise().query(
        `UPDATE production_temp_machine_lines
            SET product_standard_id=?,
                standard_version_id=?,
                machine_standard_id=?,
                standard_time_seconds=COALESCE(standard_time_seconds,?)
          WHERE id=?`,
        [
          resolvedMachine.productStandardId || null,
          resolvedMachine.standardVersionId || null,
          resolvedMachine.machineStandardId || null,
          resolvedMachine.standardTimeSeconds || null,
          Number(line.id),
        ],
      );
      line.product_standard_id = resolvedMachine.productStandardId || null;
      line.standard_version_id = resolvedMachine.standardVersionId || null;
      line.machine_standard_id = resolvedMachine.machineStandardId || null;
      return;
    }
  } catch (error) {
    console.warn(
      `[KTC] Legacy machine-standard hydration skipped for temp #${report.id}, line #${line.id}: ${error.message}`,
    );
  }

  try {
    const resolvedProduct = await resolver.resolveStandard({
      processId: report.process_id,
      productCode,
      workDate: report.work_date,
    });

    if (!sameStandardOutput(storedOutput, resolvedProduct.standardOutput)) return;

    await db.promise().query(
      `UPDATE production_temp_machine_lines
          SET product_standard_id=?,
              standard_version_id=?,
              machine_standard_id=NULL,
              standard_time_seconds=COALESCE(standard_time_seconds,?)
        WHERE id=?`,
      [
        resolvedProduct.productStandardId || null,
        resolvedProduct.standardVersionId || null,
        resolvedProduct.standardTimeSeconds || null,
        Number(line.id),
      ],
    );
    line.product_standard_id = resolvedProduct.productStandardId || null;
    line.standard_version_id = resolvedProduct.standardVersionId || null;
    line.machine_standard_id = null;
  } catch (error) {
    console.warn(
      `[KTC] Legacy product-standard hydration skipped for temp #${report.id}, line #${line.id}: ${error.message}`,
    );
  }
}

async function hydrateLegacyReportSnapshot(report) {
  if (!report) return;
  if (Number(report.standard_version_id || 0) > 0 || Number(report.machine_standard_id || 0) > 0) return;

  const productCode = String(report.product_name || "").split(",")[0].trim();
  const storedOutput = Number(report.standard_output || 0);
  if (!productCode || !Number.isFinite(storedOutput) || storedOutput <= 0) return;

  try {
    const resolver = createStandardResolver();
    const resolved = await resolver.resolveStandard({
      processId: report.process_id,
      productCode,
      workDate: report.work_date,
    });
    if (!sameStandardOutput(storedOutput, resolved.standardOutput)) return;

    await db.promise().query(
      `UPDATE production_reports_temp
          SET standard_version_id=?, machine_standard_id=?
        WHERE id=?`,
      [resolved.standardVersionId || null, resolved.machineStandardId || null, Number(report.id)],
    );
    report.standard_version_id = resolved.standardVersionId || null;
    report.machine_standard_id = resolved.machineStandardId || null;
  } catch (error) {
    console.warn(`[KTC] Legacy report-standard hydration skipped for temp #${report.id}: ${error.message}`);
  }
}

async function ensureLegacyMachineLines(targets) {
  const normalized = (Array.isArray(targets) ? targets : [])
    .map((item) => typeof item === "object" ? item : { id: item })
    .map((item) => Number(item?.id))
    .filter((id) => Number.isInteger(id) && id > 0);
  if (!normalized.length) return;

  const placeholders = normalized.map(() => "?").join(",");
  const [reports] = await db.promise().query(
    `SELECT t.id,t.process_id,t.operation_mode,t.work_date,t.machine_no,t.product_name,
            t.actual_time,t.standard_output,t.standard_version_id,t.machine_standard_id,
            t.exclude_kqd_from_tt_snapshot,t.actual_output,t.tt_ok,t.tt_ng
       FROM production_reports_temp t
      WHERE t.id IN (${placeholders})
        AND t.status IN ('pending','need_fix')`,
    normalized,
  );

  for (const report of reports || []) {
    if (String(report.operation_mode || "").toUpperCase() !== "MACHINE") {
      await hydrateLegacyReportSnapshot(report);
      continue;
    }

    const machineCode = String(report.machine_no || "").split(",")[0].trim();
    const productCode = String(report.product_name || "").split(",")[0].trim();
    if (!machineCode || !productCode) continue;

    const [existing] = await db.promise().query(
      `SELECT * FROM production_temp_machine_lines WHERE temp_report_id=? LIMIT 1`,
      [Number(report.id)],
    );

    if (existing?.length) {
      const line = existing[0];
      const missingProduct = !String(line.product_code || "").trim();
      const missingMachine = !String(line.machine_code || "").trim();
      if (missingProduct || missingMachine) {
        await db.promise().query(
          `UPDATE production_temp_machine_lines
              SET product_code=CASE WHEN TRIM(COALESCE(product_code,''))='' THEN ? ELSE product_code END,
                  machine_code=CASE WHEN TRIM(COALESCE(machine_code,''))='' THEN ? ELSE machine_code END
            WHERE id=?`,
          [productCode, machineCode, Number(line.id)],
        );
        line.product_code = line.product_code || productCode;
        line.machine_code = line.machine_code || machineCode;
      }
      await hydrateLegacyMachineLineSnapshot(report, line);
      continue;
    }

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
      const result = await db.promise().query(
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
      const lineId = Number(result?.[0]?.insertId || result?.insertId || 0);
      if (lineId) {
        const [created] = await db.promise().query(
          `SELECT * FROM production_temp_machine_lines WHERE id=? LIMIT 1`,
          [lineId],
        );
        if (created?.[0]) await hydrateLegacyMachineLineSnapshot(report, created[0]);
      }
    } catch (error) {
      console.warn(`[KTC] Legacy machine-line backfill skipped for temp #${report.id}: ${error.message}`);
    }
  }
}

module.exports = {
  ...approvalModel,
  async approveSelected(targets, reviewerId, isAdmin = false) {
    await ensureLegacyMachineLines(targets);
    return approvalModel.approveSelected(targets, reviewerId, isAdmin);
  },
};
