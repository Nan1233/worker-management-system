'use strict';

// Deterministic SQL builders; preserve validation of machine line identifiers.
function buildTempMachineLineDefectsQuery(lines) {
  const ids = lines.map((line) => {
    const rawId = line?.id;
    const id = Number(rawId);
    if ((typeof rawId !== "number" && (typeof rawId !== "string" || !/^[0-9]+$/.test(rawId)))
      || !Number.isSafeInteger(id) || id <= 0) {
      const error = new Error("Dòng máy tạm có ID không hợp lệ; đã hủy duyệt để bảo vệ dữ liệu");
      error.status = 500;
      error.code = "TEMP_MACHINE_LINE_INVALID_ID";
      error.isPublic = true;
      throw error;
    }
    return id;
  });
  if (new Set(ids).size !== ids.length) {
    const error = new Error("Dòng máy tạm có ID trùng lặp; đã hủy duyệt để bảo vệ dữ liệu");
    error.status = 500;
    error.code = "TEMP_MACHINE_LINE_DUPLICATE_ID";
    error.isPublic = true;
    throw error;
  }
  return {
    sql: `SELECT *
       FROM production_temp_machine_defects
      WHERE machine_line_id IN (${ids.map(() => "?").join(",")})
      ORDER BY machine_line_id ASC, id ASC`,
    params: ids,
  };
}

function buildApprovedMachineDefectsInsert(pendingDefects) {
  return {
    sql: `INSERT INTO production_report_machine_defects
       (machine_line_id,defect_type_id,defect_code,defect_name,quantity)
       VALUES ${pendingDefects.map(() => "(?,?,?,?,?)").join(",")}`,
    params: pendingDefects.flat(),
  };
}

function buildApprovedMachineLinesRead(approvedReportId) {
  return {
    sql: `SELECT * FROM production_report_machine_lines WHERE report_id=? ORDER BY sort_order ASC, id ASC`,
    params: [approvedReportId],
  };
}






module.exports = { buildTempMachineLineDefectsQuery, buildApprovedMachineDefectsInsert, buildApprovedMachineLinesRead };
