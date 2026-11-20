'use strict';
const AuditService = require('../services/auditService');
const { rollback } = require('./productionTempModelShared');
const {
  buildApprovedVersionPreloaded, buildApprovedTempSnapshotOptions, buildApprovedTempReportVersion,
} = require('./productionApprovalReviewBuilders');
const { buildRejectedReportVersion } = require('./productionTempRejectionBuilders');

// Audit/version persistence occurs within the transaction; notifications only after commit.
async function rollbackReviewTransaction(connection, error) {
  try {
    const rollbackResult = await rollback(connection);
    if (rollbackResult?.ok === false) {
      error.rollbackError = rollbackResult.error;
      console.error(`[KTC][APPROVAL_ROLLBACK_FAILED] ${rollbackResult.error?.message || rollbackResult.error}`);
    }
  } catch (rollbackError) {
    // Never replace the original approval/rejection failure with a rollback failure.
    error.rollbackError = rollbackError;
    console.error(`[KTC][APPROVAL_ROLLBACK_FAILED] ${rollbackError?.message || rollbackError}`);
  }
}

async function deliverRejectedPostCommitNotifications(notifications) {
  for (const notification of notifications) {
    try { await AuditService.notifyUsers(notification.userIds,notification.payload); }
    catch (error) { console.warn(`[KTC] Post-commit rejection notification failed: ${error.message}`); }
  }
}

async function deliverApprovedPostCommitNotifications(notifications) {
  try {
    await AuditService.notifyBatch(notifications);
  } catch (error) {
    console.warn(`[KTC] Post-commit approval notification batch failed: ${error.message}`);
  }
}





function buildApprovedVersionRequest(item, approvedReportId, reviewerId, machineLines, defects, deductions) {
  return {
    reportId: approvedReportId,
    reason: `Tạo từ báo cáo tạm #${item.id}`,
    userId: reviewerId,
    preloaded: buildApprovedVersionPreloaded(machineLines, defects, deductions),
  };
}

async function recordApprovedTempVersion(item, approvedReportId, reviewerId, connection, tempLinesCache) {
  const approvedTempSnapshot = await AuditService.loadTempReportSnapshot(
    item.id,
    connection,
    buildApprovedTempSnapshotOptions(item, tempLinesCache),
  );
  if (approvedTempSnapshot) {
    await AuditService.createReportVersion(buildApprovedTempReportVersion(item, approvedReportId, reviewerId, approvedTempSnapshot), connection);
  }
}

async function recordRejectedTempVersion(row, cleanReason, reviewerId, connection) {
  const rejectedSnapshot = await AuditService.loadTempReportSnapshot(row.id, connection);
  if (rejectedSnapshot) {
    await AuditService.createReportVersion(buildRejectedReportVersion(row, rejectedSnapshot, cleanReason, reviewerId), connection);
  }
}


module.exports = {
  rollbackReviewTransaction, deliverRejectedPostCommitNotifications,
  deliverApprovedPostCommitNotifications, buildApprovedVersionRequest,
  recordApprovedTempVersion, recordRejectedTempVersion,
};
