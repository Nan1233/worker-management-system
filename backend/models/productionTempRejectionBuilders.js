'use strict';
const { toDateKey } = require('../utils/dateKey');

// Pure rejection write/audit/notification builders. The caller owns its SQL
// transaction and must keep row locks, optimistic version checks and rollback.
// Keep rejection's optimistic version condition and positional SQL parameters paired.
function buildRejectedReportUpdate(row, expected, cleanReason, reviewerId) {
  const sql = expected
    ? `UPDATE production_reports_temp
                SET status='rejected',review_note=?,reviewed_by=?,updated_at=NOW()
              WHERE id=? AND status IN ('pending','need_fix') AND updated_at=?`
    : `UPDATE production_reports_temp
                SET status='rejected',review_note=?,reviewed_by=?,updated_at=NOW()
              WHERE id=? AND status IN ('pending','need_fix')`;
  const params = expected
    ? [cleanReason,reviewerId,row.id,expected]
    : [cleanReason,reviewerId,row.id];
  return { sql, params };
}

function buildRejectedReportVersion(row, rejectedSnapshot, cleanReason, reviewerId) {
  return {
    reportType:"temp",reportId:row.id,snapshot:rejectedSnapshot,
    reason:`Bị từ chối: ${cleanReason}`,userId:reviewerId,
  };
}

function buildRejectedReportActivity(row, cleanReason, reviewerId) {
  return {
    userId: reviewerId,
    action: "REPORT_REJECTED",
    entityType: "temp_report",
    entityId: row.id,
    description: `Từ chối báo cáo #${row.id}: ${cleanReason}`,
    metadata: { reason: cleanReason, worker_id: row.worker_id, process_id: row.process_id },
  };
}

function buildRejectedReportNotification(row, cleanReason) {
  return {
    userIds:[row.worker_user_id],
    payload:{
      type:"report_rejected",title:"Báo cáo đã bị từ chối",
      message:`Báo cáo ngày ${toDateKey(row.work_date)}, ca ${row.shift || "-"} bị từ chối: ${cleanReason}`,
      linkUrl:`/worker/history/${row.id}?source=pending`,entityType:"temp_report",entityId:row.id,
    },
  };
}


module.exports = {
  buildRejectedReportUpdate,
  buildRejectedReportVersion,
  buildRejectedReportActivity,
  buildRejectedReportNotification,
};
