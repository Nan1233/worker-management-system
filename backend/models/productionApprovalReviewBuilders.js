'use strict';

// Pure approval/rejection response and conflict builders. No database side effects.
function getApprovedWorkDate(item) {
  return item.work_date instanceof Date
    ? `${item.work_date.getFullYear()}-${String(item.work_date.getMonth()+1).padStart(2,"0")}-${String(item.work_date.getDate()).padStart(2,"0")}`
    : String(item.work_date).slice(0,10);
}

function byApprovedTypeThenId(key) {
  return (a, b) => (Number(a[key] ?? -Infinity) - Number(b[key] ?? -Infinity)) || (Number(a.id) - Number(b.id));
}

function buildApprovedVersionPreloaded(machineLines, defects, deductions) {
  return {
    machineLines,
    defects: [...defects].sort(byApprovedTypeThenId("defect_type_id")).map((row) => ({ defect_type_id: row.defect_type_id, quantity: row.quantity })),
    deductions: [...deductions].sort(byApprovedTypeThenId("deduction_type_id")).map((row) => ({ deduction_type_id: row.deduction_type_id, hours: row.hours })),
  };
}

function buildApprovedPostCommitActivities(item, approvedReportId, reviewerId) {
  return [
    {
      userId: reviewerId,
      action: "REPORT_APPROVED",
      entityType: "temp_report",
      entityId: item.id,
      description: `Duyệt báo cáo thành công #${approvedReportId}`,
      metadata: { approved_report_id: approvedReportId },
    },
    {
      userId: reviewerId,
      action: "REPORT_CREATED",
      entityType: "approved_report",
      entityId: approvedReportId,
      description: `Tạo báo cáo đã duyệt từ #${item.id}`,
      metadata: { temp_report_id: item.id },
    },
    {
      userId: reviewerId,
      action: "REPORT_APPROVED",
      entityType: "approved_report",
      entityId: approvedReportId,
      description: `Duyệt báo cáo #${item.id} thành báo cáo đã duyệt #${approvedReportId}`,
      metadata: {
        temp_report_id: item.id,
        approved_report_id: approvedReportId,
        worker_id: item.worker_id,
        process_id: item.process_id,
        work_date: item.work_date,
        shift: item.shift,
      },
    },
  ];
}

function buildApprovedPostCommitNotification(item, approvedReportId, workDate) {
  return {
    userIds:[item.worker_user_id],
    payload:{
      type:"report_approved",
      title:"Báo cáo đã được duyệt",
      message:`Báo cáo ngày ${workDate}, ca ${item.shift || "-"}, sản phẩm ${item.product_name || "-"} đã được duyệt.`,
      linkUrl:`/worker/history/${approvedReportId}?source=approved`,
      entityType:"approved_report",
      entityId:approvedReportId,
    },
  };
}


function createReviewTransitionConflictError(reportId, code) {
  const error = new Error(`Báo cáo #${reportId} đã được xử lý bởi người khác. Hãy tải lại danh sách rồi thử lại.`);
  error.status = 409;
  error.code = code;
  error.isPublic = true;
  return error;
}

function hasExactlyOneAffectedRow(result) {
  return Number(result?.affectedRows || 0) === 1;
}

function assertApprovedTempTransition(statusUpdate, item) {
  if (!hasExactlyOneAffectedRow(statusUpdate)) {
    throw createReviewTransitionConflictError(item.id, "APPROVAL_SELECTION_STALE");
  }
}

function buildApprovedTempSnapshotOptions(item, tempLinesCache) {
  return tempLinesCache.has(Number(item.id))
    ? { machineLines: tempLinesCache.get(Number(item.id)) }
    : null;
}

function buildApprovedTempReportVersion(item, approvedReportId, reviewerId, approvedTempSnapshot) {
  return {
    reportType:"temp",
    reportId:item.id,
    snapshot:approvedTempSnapshot,
    reason:`Được duyệt thành báo cáo chính thức #${approvedReportId}`,
    userId:reviewerId,
  };
}

function buildApprovalBatchResult(rows, approvedIds, dates) {
  return {
    count: rows.length,
    temp_ids: rows.map((row) => row.id),
    approved_ids: approvedIds,
    dates: [...dates],
  };
}

function assertRejectedTempTransition(updateResult, row) {
  if (!hasExactlyOneAffectedRow(updateResult)) {
    throw createReviewTransitionConflictError(row.id, "TEMP_REPORT_VERSION_CONFLICT");
  }
}

function buildRejectionBatchResult(rows) {
  return {count:rows.length,ids:rows.map((row)=>row.id)};
}


module.exports = {
  getApprovedWorkDate,
  buildApprovedVersionPreloaded,
  buildApprovedPostCommitActivities,
  buildApprovedPostCommitNotification,
  assertApprovedTempTransition,
  buildApprovedTempSnapshotOptions,
  buildApprovedTempReportVersion,
  buildApprovalBatchResult,
  assertRejectedTempTransition,
  buildRejectionBatchResult,
};
