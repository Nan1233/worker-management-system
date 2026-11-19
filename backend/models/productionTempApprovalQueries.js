'use strict';

function buildApprovalScopeQuery(reportIds, reviewerId, isAdmin) {
  const placeholders = reportIds.map(() => "?").join(",");
  const scopeJoin = isAdmin ? "" : "LEFT JOIN manager_processes mp ON mp.process_id = temp.process_id";
  const scopeWhere = isAdmin ? "" : "AND mp.manager_id = ?";
  const params = isAdmin ? reportIds : [...reportIds, reviewerId];
  return {
    sql: `SELECT DISTINCT temp.*, w.user_id AS worker_user_id,
                (SELECT p.process_code FROM processes p WHERE p.id=temp.process_id LIMIT 1) AS process_code
           FROM production_reports_temp temp
           JOIN workers w ON w.id=temp.worker_id
           ${scopeJoin}
          WHERE temp.id IN (${placeholders})
            AND temp.status IN ('pending','need_fix')
            ${scopeWhere}
          ORDER BY temp.id ASC
          FOR UPDATE`,
    params,
  };
}

function buildRejectionScopeQuery(reportIds, reviewerId, isAdmin) {
  const placeholders = reportIds.map(() => "?").join(",");
  const scopeJoin = isAdmin ? "" : "JOIN manager_processes mp ON mp.process_id=temp.process_id";
  const scopeWhere = isAdmin ? "" : "AND mp.manager_id=?";
  const params = isAdmin ? [...reportIds] : [...reportIds,reviewerId];
  return {
    sql: `SELECT DISTINCT temp.id,temp.worker_id,temp.process_id,temp.work_date,temp.shift,temp.updated_at,
                w.user_id AS worker_user_id
           FROM production_reports_temp temp
           JOIN workers w ON w.id=temp.worker_id
           ${scopeJoin}
          WHERE temp.id IN (${placeholders})
            AND temp.status IN ('pending','need_fix')
            ${scopeWhere}
          ORDER BY temp.id ASC
          FOR UPDATE`,
    params,
  };
}

function buildApprovedDetailCopyQuery(kind, approvedReportId, tempReportId) {
  if (kind === "defects") {
    return {
      sql: `INSERT INTO production_report_defects (report_id,defect_type_id,quantity)
           SELECT ?,defect_type_id,quantity FROM production_temp_defects WHERE temp_report_id=?`,
      params: [approvedReportId, tempReportId],
    };
  }
  if (kind === "deductions") {
    return {
      sql: `INSERT INTO production_report_deductions (report_id,deduction_type_id,hours)
           SELECT ?,deduction_type_id,hours FROM production_temp_deductions WHERE temp_report_id=?`,
      params: [approvedReportId, tempReportId],
    };
  }
  throw new Error("Unsupported approved detail kind");
}

function buildApprovedDetailReadQuery(kind, approvedReportId) {
  if (kind === "defects") {
    return {
      sql: `SELECT d.id, d.defect_type_id, dt.defect_code, dt.defect_name, d.quantity
             FROM production_report_defects d
             LEFT JOIN defect_types dt ON dt.id=d.defect_type_id
            WHERE d.report_id=? ORDER BY d.id`,
      params: [approvedReportId],
    };
  }
  if (kind === "deductions") {
    return {
      sql: `SELECT d.id, d.deduction_type_id, dt.deduction_code, dt.deduction_name, d.hours
             FROM production_report_deductions d
             LEFT JOIN deduction_types dt ON dt.id=d.deduction_type_id
            WHERE d.report_id=? ORDER BY d.id`,
      params: [approvedReportId],
    };
  }
  throw new Error("Unsupported approved detail kind");
}

function buildApprovedTempTransitionQuery(item, reviewerId) {
  return {
    sql: `UPDATE production_reports_temp
              SET status='approved',reviewed_by=?,approved_at=NOW(),updated_at=NOW()
            WHERE id=? AND status IN ('pending','need_fix') AND updated_at=?`,
    params: [reviewerId, item.id, item.updated_at],
  };
}

module.exports = { buildApprovalScopeQuery, buildRejectionScopeQuery, buildApprovedDetailCopyQuery, buildApprovedDetailReadQuery, buildApprovedTempTransitionQuery };
