'use strict';
const AuditService = require('../services/auditService');
const { buildApprovalScopeQuery, buildApprovedTempTransitionQuery } = require('./productionTempApprovalQueries');
const { qRows } = require('../repositories/productionApprovalReadRepository');
const { buildApprovalSelection, assertApprovalSelectionVisible, assertApprovalSelectionVersions } = require('./productionTempApprovalSelection');
const { query, getConnection, beginTransaction, commit } = require('./productionTempModelShared');
const { createStandardResolver } = require('../services/standardResolutionService');
const { assertReviewBatchSize } = require('../services/managerReportPaginationService');
const { validateApprovalSnapshot } = require('./productionApprovalSnapshotValidation');
const { buildApprovedParentInsertQuery, copyApprovedReportDetails, createLegacyApprovedSnapshot } = require('./productionApprovalPersistence');
const { copyMachineLinesToApproved } = require('./productionApprovalMachineCopy');
const { createApprovedReportVersion } = require('../services/approvedVersionSnapshotService');
const {
  getApprovedWorkDate, buildApprovedPostCommitActivities, buildApprovedPostCommitNotification,
  assertApprovedTempTransition, buildApprovalBatchResult,
} = require('./productionApprovalReviewBuilders');
const {
  rollbackReviewTransaction, deliverApprovedPostCommitNotifications,
  buildApprovedVersionRequest, recordApprovedTempVersion,
} = require('./productionApprovalReviewSideEffects');

// TiDB operations remain sequential. Shared transactions are committed by the caller.
async function approveSelected(targets, reviewerId, isAdmin = false, options = {}) {
    assertReviewBatchSize(targets);
    const { reportIds, expectedById } = buildApprovalSelection(targets);
    // Fail before any writes when an external caller owns the transaction.
    // Otherwise a missing callback list would throw after writing approved data.
    if (options.connection && !Array.isArray(options.postCommitCallbacks)) {
      throw new Error('Shared approval transaction requires postCommitCallbacks');
    }
    const connection = options.connection || await getConnection();
    const ownsTransaction = !options.connection;
    const postCommitNotifications = [];
    const postCommitActivities = [];
    const approvedIds = [];
    const dates = new Set();

    try {
      if (ownsTransaction) await beginTransaction(connection);
      const { sql: selectionSql, params: selectionParams } = buildApprovalScopeQuery(reportIds, reviewerId, isAdmin);
      const rows = await query(connection, selectionSql, selectionParams);
      assertApprovalSelectionVisible(rows, reportIds);
      assertApprovalSelectionVersions(rows, expectedById);

      const standardResolver = createStandardResolver({
        query: (sql, params = []) => qRows(connection, sql, params),
      });

      const tempLinesCache = new Map();
      for (const item of rows) {
        await validateApprovalSnapshot(item, connection, standardResolver, tempLinesCache);

        const { sql: parentInsertSql, params: parentInsertParams } = buildApprovedParentInsertQuery(item, reviewerId);
        const insertResult = await query(connection, parentInsertSql, parentInsertParams);
        const approvedReportId = Number(insertResult.insertId);
        if (!Number.isSafeInteger(approvedReportId) || approvedReportId <= 0) {
          const error = new Error(`Không xác nhận được ID báo cáo đã duyệt cho báo cáo tạm #${item.id}; đã hủy duyệt để bảo vệ dữ liệu`);
          error.status = 500;
          error.code = "APPROVED_PARENT_INSERT_ID_INVALID";
          error.isPublic = true;
          throw error;
        }
        approvedIds.push(approvedReportId);

        const workDate = getApprovedWorkDate(item);
        dates.add(workDate);

        const { approvedDefects, approvedDeductions } = await copyApprovedReportDetails(connection, approvedReportId, item.id);
        const copied = await copyMachineLinesToApproved(item.id, approvedReportId, connection, tempLinesCache.get(Number(item.id)) || null);
        // Without machine lines nothing was inserted, so an empty array is the correct "just read" result.
        const approvedMachineLines = copied.rows;
        await createLegacyApprovedSnapshot(item, approvedReportId, reviewerId, connection, {
          machineLines: approvedMachineLines,
          defects: approvedDefects,
          deductions: approvedDeductions,
        });
        await createApprovedReportVersion(
          buildApprovedVersionRequest(item, approvedReportId, reviewerId, approvedMachineLines, approvedDefects, approvedDeductions),
          connection,
        );

        postCommitActivities.push(...buildApprovedPostCommitActivities(item, approvedReportId, reviewerId));

        // The final temp transition must succeed before committing the
        // approved report, copied lines, snapshots and audit records.
        // A lost status race must roll back the entire transaction.
        const { sql: statusSql, params: statusParams } = buildApprovedTempTransitionQuery(item, reviewerId);
        const statusUpdate = await query(connection, statusSql, statusParams);
        assertApprovedTempTransition(statusUpdate, item);

        await recordApprovedTempVersion(item, approvedReportId, reviewerId, connection, tempLinesCache);

        postCommitNotifications.push(buildApprovedPostCommitNotification(item, approvedReportId, workDate));
      }

      await AuditService.logActivities(postCommitActivities, connection);
      if (ownsTransaction) {
        await commit(connection);
        await deliverApprovedPostCommitNotifications(postCommitNotifications);
      } else if (Array.isArray(options.postCommitCallbacks)) {
        options.postCommitCallbacks.push(() => deliverApprovedPostCommitNotifications(postCommitNotifications));
      } else {
        throw new Error('Shared approval transaction requires postCommitCallbacks');
      }
      return buildApprovalBatchResult(rows, approvedIds, dates);
    } catch (error) {
      if (ownsTransaction) await rollbackReviewTransaction(connection, error);
      throw error;
    } finally {
      if (ownsTransaction) connection.release();
    }
  }

module.exports = { approveSelected };
