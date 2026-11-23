'use strict';
const AuditService = require('./auditService');
const { readReviewCandidates } = require('../repositories/productionApprovalReadRepository');
const { buildApprovalSelection, assertApprovalSelectionVisible, assertApprovalSelectionVersions } = require('../models/productionTempApprovalSelection');
const { buildRejectedReportActivity, buildRejectedReportNotification } = require('../models/productionTempRejectionBuilders');
const { transitionRejectedTemp } = require('../repositories/productionRejectionRepository');
const { getConnection, beginTransaction, commit } = require('../models/productionTempModelShared');
const { assertReviewBatchSize } = require('./managerReportPaginationService');
const { assertRejectedTempTransition, buildRejectionBatchResult } = require('../models/productionApprovalReviewBuilders');
const {
  rollbackReviewTransaction, deliverRejectedPostCommitNotifications, recordRejectedTempVersion,
} = require('../models/productionApprovalReviewSideEffects');

// Atomic rejection: version check, status update and audit share one transaction.
async function rejectSelected(targets, reviewerId, reason, isAdmin = false) {
    assertReviewBatchSize(targets);
    const { reportIds, expectedById } = buildApprovalSelection(targets);
    const cleanReason = String(reason || "").trim();
    if (!cleanReason) throw new Error("Vui lòng nhập lý do từ chối");

    const connection = await getConnection();
    const postCommitNotifications = [];
    let transactionCommitted = false;
    try {
      await beginTransaction(connection);
      const rows = await readReviewCandidates(connection, reportIds, reviewerId, isAdmin, 'reject');
      assertApprovalSelectionVisible(rows, reportIds);
      assertApprovalSelectionVersions(rows, expectedById);
      for (const row of rows) {
        const expected = expectedById.get(Number(row.id));
        const updateResult = await transitionRejectedTemp(connection, row, expected, cleanReason, reviewerId);
        assertRejectedTempTransition(updateResult, row);
        await recordRejectedTempVersion(row, cleanReason, reviewerId, connection);
        await AuditService.logActivity(buildRejectedReportActivity(row, cleanReason, reviewerId), connection);
        postCommitNotifications.push(buildRejectedReportNotification(row, cleanReason));
      }
      await commit(connection);
      transactionCommitted = true;
      await deliverRejectedPostCommitNotifications(postCommitNotifications);
      return buildRejectionBatchResult(rows);
    } catch (error) {
      if (!transactionCommitted) await rollbackReviewTransaction(connection, error);
      throw error;
    } finally {
      connection.release();
    }
  }

module.exports = { rejectSelected };
