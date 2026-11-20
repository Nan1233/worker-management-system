'use strict';

// Stable v1 approval snapshot projection and SQL builders.
// Keep the v1 payload and stored shape intact for historical reports and Excel.
function buildLegacySnapshotDefects(rows) {
  return rows.map((row) => ({ defect_code: row.defect_code, defect_name: row.defect_name, quantity: row.quantity }));
}

function buildLegacySnapshotDeductions(rows) {
  return rows.map((row) => ({ deduction_code: row.deduction_code, deduction_name: row.deduction_name, hours: row.hours }));
}

function buildLegacyApprovedSnapshotPayload(item, approvedReportId, snapshotDefects, snapshotDeductions, machineLines) {
  return {
    report: {
      id: approvedReportId,
      source_temp_id: item.id,
      worker_id: item.worker_id,
      process_id: item.process_id,
      work_date: item.work_date,
      entry_date: item.entry_date || item.work_date,
      shift: item.shift,
      operation_type: item.operation_type ?? null,
      operation_mode: item.operation_mode ?? null,
      machine_no: item.machine_no,
      product_code: item.product_name,
      total_time: Number(item.total_time || 0),
      actual_time: Number(item.actual_time || 0),
      deduction_time: Number(item.deduction_time || 0),
      standard_output: Number(item.standard_output || 0),
      actual_output: Number(item.actual_output || 0),
      tt_ok: Number(item.tt_ok || 0),
      tt_ng: Number(item.tt_ng || 0),
      standard_version_id: item.standard_version_id || null,
      machine_standard_id: item.machine_standard_id || null,
      training_percent_snapshot: item.training_percent_snapshot ?? null,
    },
    defects: snapshotDefects,
    deductions: snapshotDeductions,
    machineLines,
  };
}

function buildLegacySnapshotDefectsRead(approvedReportId) {
  return {
    sql: `SELECT dt.defect_code, dt.defect_name, d.quantity
         FROM production_report_defects d
         LEFT JOIN defect_types dt ON dt.id=d.defect_type_id
        WHERE d.report_id=? ORDER BY d.id`,
    params: [approvedReportId],
  };
}

function buildLegacySnapshotDeductionsRead(approvedReportId) {
  return {
    sql: `SELECT dt.deduction_code, dt.deduction_name, d.hours
         FROM production_report_deductions d
         LEFT JOIN deduction_types dt ON dt.id=d.deduction_type_id
        WHERE d.report_id=? ORDER BY d.id`,
    params: [approvedReportId],
  };
}

function buildLegacySnapshotInsert(item, approvedReportId, reviewerId, snapshotData) {
  return {
    sql: `INSERT INTO production_report_snapshots
      (report_id,snapshot_type,standard_version_id,calculation_version,snapshot_data,created_by)
     VALUES(?,'approved',?,'v1',?,?)
     ON DUPLICATE KEY UPDATE
       snapshot_data=VALUES(snapshot_data),
       standard_version_id=VALUES(standard_version_id),
       created_by=VALUES(created_by),
       created_at=CURRENT_TIMESTAMP`,
    params: [approvedReportId, item.standard_version_id || null, snapshotData, reviewerId],
  };
}

module.exports = {
  buildLegacySnapshotDefects,
  buildLegacySnapshotDeductions,
  buildLegacyApprovedSnapshotPayload,
  buildLegacySnapshotDefectsRead,
  buildLegacySnapshotDeductionsRead,
  buildLegacySnapshotInsert,
};
