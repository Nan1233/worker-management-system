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

async function readLegacySnapshotRows(connection, { sql, params }) {
  return qRows(connection, sql, params);
}

async function createLegacyApprovedSnapshot(item, approvedReportId, reviewerId, connection, preloaded = {}) {
  const preloadedMachineLines = preloaded.machineLines || null;
  // TiDB Serverless transaction connections must not run concurrent queries.
  // Keep these snapshot reads sequential on the same transaction connection.
  const snapshotDefects = preloaded.defects
    ? buildLegacySnapshotDefects(preloaded.defects)
    : await readLegacySnapshotRows(connection, buildLegacySnapshotDefectsRead(approvedReportId));
  const snapshotDeductions = preloaded.deductions
    ? buildLegacySnapshotDeductions(preloaded.deductions)
    : await readLegacySnapshotRows(connection, buildLegacySnapshotDeductionsRead(approvedReportId));
  const machineLines = Array.isArray(preloadedMachineLines)
    ? preloadedMachineLines
    : await readLegacySnapshotRows(connection, buildApprovedMachineLinesRead(approvedReportId));
  const snapshotData = JSON.stringify(buildLegacyApprovedSnapshotPayload(item, approvedReportId, snapshotDefects, snapshotDeductions, machineLines));
  const { sql: snapshotSql, params: snapshotParams } = buildLegacySnapshotInsert(item, approvedReportId, reviewerId, snapshotData);
  await query(connection, snapshotSql, snapshotParams);
}

// Preserve the positional values of the approved-report INSERT (approved_at remains NOW()).
function buildApprovedReportInsertValues(item, reviewerId) {
  return [
            item.id,item.worker_id,item.process_id,item.work_date,item.entry_date || item.work_date,item.shift,
            item.operation_type ?? null,item.operation_mode ?? null,item.machine_no,item.product_name,
            item.total_time,item.actual_time,item.deduction_time,item.standard_output,item.standard_version_id || null,
            item.machine_standard_id || null,item.training_percent_snapshot ?? null,item.exclude_kqd_from_tt_snapshot ?? null,
            item.actual_output,item.tt_ok,item.tt_ng,item.kqd_dap_lai,item.kqd_tuot,item.vo_do_long,item.xuoc_do_long,
            item.cong_gay,item.xoay,item.khong_dut,item.bavia_hut,item.ppcm,item.loi_cao_su,item.ng_kich_thuoc,
            item.cat_lem,item.note,serializeExtraData(item.extra_data),"approved",item.review_note,reviewerId,
  ];
}

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

function buildApprovedParentInsertQuery(item, reviewerId) {
  return {
    sql: `INSERT INTO production_reports
           (source_temp_id,worker_id,process_id,work_date,entry_date,shift,operation_type,operation_mode,machine_no,
            product_name,total_time,actual_time,deduction_time,standard_output,standard_version_id,machine_standard_id,
            training_percent_snapshot,exclude_kqd_from_tt_snapshot,actual_output,tt_ok,tt_ng,kqd_dap_lai,kqd_tuot,
            vo_do_long,xuoc_do_long,cong_gay,xoay,khong_dut,bavia_hut,ppcm,loi_cao_su,ng_kich_thuoc,cat_lem,note,
            extra_data,status,review_note,reviewed_by,approved_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())`,
    params: buildApprovedReportInsertValues(item, reviewerId),
  };
}



async function copyApprovedReportDetails(connection, approvedReportId, tempReportId) {
  const { sql: defectsCopySql, params: defectsCopyParams } = buildApprovedDetailCopyQuery("defects", approvedReportId, tempReportId);
  await query(connection, defectsCopySql, defectsCopyParams);
  const { sql: deductionsCopySql, params: deductionsCopyParams } = buildApprovedDetailCopyQuery("deductions", approvedReportId, tempReportId);
  await query(connection, deductionsCopySql, deductionsCopyParams);
  // Sequential reads share the same TiDB transaction connection and serve both snapshot formats.
  const { sql: defectsReadSql, params: defectsReadParams } = buildApprovedDetailReadQuery("defects", approvedReportId);
  const approvedDefects = await qRows(connection, defectsReadSql, defectsReadParams);
  const { sql: deductionsReadSql, params: deductionsReadParams } = buildApprovedDetailReadQuery("deductions", approvedReportId);
  const approvedDeductions = await qRows(connection, deductionsReadSql, deductionsReadParams);
  return { approvedDefects, approvedDeductions };
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
