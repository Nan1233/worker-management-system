const { buildApprovalScopeQuery, buildRejectionScopeQuery, buildApprovedDetailCopyQuery, buildApprovedDetailReadQuery, buildApprovedTempTransitionQuery } = require('./productionTempApprovalQueries');
const AuditService = require("../services/auditService");
const { verifyApprovedMachineLineCopy } = require('./productionApprovedMachineLineVerification');
const { buildTempMachineLineDefectsQuery, buildApprovedMachineDefectsInsert, buildApprovedMachineLinesRead } = require('./productionApprovalMachineQueries');
const {
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
} = require('./productionApprovalReviewBuilders');
const { qRows } = require("../repositories/productionApprovalReadRepository");
const { attachMachineLineDefects } = require("../modules/production/domain/machineDefectLineage");
const { isParentProcessNonProductWork, hasNonProductSnapshotMismatch, createNonProductSnapshotMismatchError, assertNonProductWorkSnapshot } = require("../modules/production/domain/nonProductSnapshot");
const {
  buildApprovalSelection,
  assertApprovalSelectionVisible,
  assertApprovalSelectionVersions,
} = require("./productionTempApprovalSelection");
const {
  buildRejectedReportUpdate,
  buildRejectedReportVersion,
  buildRejectedReportActivity,
  buildRejectedReportNotification,
} = require("./productionTempRejectionBuilders");
const { explicitGcWorkType } = require("../utils/gcMachineWorkType");
const {
  query,
  getConnection,
  beginTransaction,
  commit,
  rollback,
} = require("./productionTempModelShared");
const {
  createStandardResolver,
  assertStandardSnapshotConsistency,
} = require("../services/standardResolutionService");
const {
  assertApprovedEventForTempLine,
  prepareApprovedEventContext,
} = require("../services/machineProductionEventService");
const { serializeExtraData: serializeExtraDataValue } = require("../services/productionApprovalService");
const {
  buildLegacySnapshotDefects,
  buildLegacySnapshotDeductions,
  buildLegacyApprovedSnapshotPayload,
  buildLegacySnapshotDefectsRead,
  buildLegacySnapshotDeductionsRead,
  buildLegacySnapshotInsert,
} = require("./productionTempApprovedSnapshotBuilders");

function serializeExtraData(value) {
  const serialized = JSON.stringify(value);
  return serialized === undefined ? serializeExtraDataValue(value) : serialized;
}
const { createApprovedReportVersion } = require("../services/approvedVersionSnapshotService");
const { assertReviewBatchSize } = require("../services/managerReportPaginationService");
const { storedStandardSource } = require('../utils/standardSourceCode');



const { getTempMachineLines, copyMachineLinesToApproved } = require('./productionApprovalMachineCopy');

const { validateApprovalSnapshot } = require('./productionApprovalSnapshotValidation');

const {
  createLegacyApprovedSnapshot, buildApprovedParentInsertQuery, copyApprovedReportDetails,
} = require('./productionApprovalPersistence');

const {
  rollbackReviewTransaction, deliverRejectedPostCommitNotifications,
  deliverApprovedPostCommitNotifications, buildApprovedVersionRequest,
  recordApprovedTempVersion, recordRejectedTempVersion,
} = require('./productionApprovalReviewSideEffects');

module.exports = {
  async approveSelected(targets, reviewerId, isAdmin = false, options = {}) {
    assertReviewBatchSize(targets);
    const { reportIds, expectedById } = buildApprovalSelection(targets);
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
  },

  async rejectSelected(targets, reviewerId, reason, isAdmin = false) {
    assertReviewBatchSize(targets);
    const { reportIds, expectedById } = buildApprovalSelection(targets);
    const cleanReason = String(reason || "").trim();
    if (!cleanReason) throw new Error("Vui lòng nhập lý do từ chối");

    const connection = await getConnection();
    const postCommitNotifications = [];
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
      await deliverRejectedPostCommitNotifications(postCommitNotifications);
      return buildRejectionBatchResult(rows);
    } catch (error) {
      await rollbackReviewTransaction(connection, error);
      throw error;
    } finally {
      connection.release();
    }
  },
};
