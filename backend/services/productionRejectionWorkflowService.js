'use strict';
const AuditService = require('./auditService');
const { buildRejectionScopeQuery } = require('../models/productionTempApprovalQueries');
const { buildApprovalSelection, assertApprovalSelectionVisible, assertApprovalSelectionVersions } = require('../models/productionTempApprovalSelection');
const { buildRejectedReportUpdate, buildRejectedReportActivity, buildRejectedReportNotification } = require('../models/productionTempRejectionBuilders');
const { query, getConnection, beginTransaction, commit } = require('../models/productionTempModelShared');
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
      const { sql: selectionSql, params: selectionParams } = buildRejectionScopeQuery(reportIds, reviewerId, isAdmin);
      const rows = await query(connection, selectionSql, selectionParams);
      assertApprovalSelectionVisible(rows, reportIds);
      assertApprovalSelectionVersions(rows, expectedById);
      for (const row of rows) {
        const expected = expectedById.get(Number(row.id));
        const { sql: updateSql, params: updateParams } = buildRejectedReportUpdate(row, expected, cleanReason, reviewerId);
        const updateResult = await query(connection,updateSql,updateParams);
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
