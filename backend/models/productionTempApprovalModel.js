const { buildApprovalScopeQuery, buildRejectionScopeQuery, buildApprovedDetailCopyQuery, buildApprovedDetailReadQuery, buildApprovedTempTransitionQuery } = require('./productionTempApprovalQueries');
const AuditService = require("../services/auditService");
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



function buildTempMachineLinesRead(tempReportId) {
  return {
    sql: `SELECT *
       FROM production_temp_machine_lines
      WHERE temp_report_id=?
      ORDER BY sort_order ASC, id ASC`,
    params: [Number(tempReportId)],
  };
}

async function getTempMachineLines(tempReportId, connection) {
  const { sql: lineSql, params: lineParams } = buildTempMachineLinesRead(tempReportId);
  const lines = await qRows(connection, lineSql, lineParams);
  if (!lines.length) return [];

  const { sql: defectSql, params: defectParams } = buildTempMachineLineDefectsQuery(lines);
  const defects = await qRows(connection, defectSql, defectParams);
  return attachMachineLineDefects(lines, defects);
}

// Build approved defect rows in machine-line order, preserving the legacy
// null/default conversions and each line's defect order.
function buildApprovedMachineDefectRows(tempLines, approvedLinesByInsertOrder) {
  const rows = [];
  tempLines.forEach((line, index) => {
    const approvedLineId = Number(approvedLinesByInsertOrder[index].id);
    for (const defect of line.defects || []) {
      rows.push([
        approvedLineId,
        defect.defect_type_id || null,
        defect.defect_code || null,
        defect.defect_name || null,
        defect.quantity || 0,
      ]);
    }
  });
  return rows;
}

// Keep the approved machine-line INSERT column order and legacy defaults stable.
function buildApprovedMachineLineValues(tempLines, approvedReportId) {
  return tempLines.flatMap((line) => [
    approvedReportId,
    line.machine_event_id || null,
    line.machine_id || null,
    line.machine_code,
    line.product_standard_id || null,
    line.standard_version_id || null,
    line.machine_standard_id || null,
    line.product_code,
    line.machine_time_hours,
    line.standard_output,
    line.standard_time_seconds || null,
    storedStandardSource(line.standard_source),
    line.ok_quantity,
    line.ng_quantity,
    line.maximum_output,
    line.deduction_time_hours || 0,
    serializeExtraData(line.deductions_json),
    line.counted_output || 0,
    line.earned_standard_hours || 0,
    serializeExtraData(line.defects_json),
    line.sort_order || 1,
  ]);
}

// Verify the bulk INSERT's assumed id ordering before associating defects.
// This check intentionally fails closed if the database returns unexpected rows.
function verifyApprovedMachineLineCopy(approvedRows, tempLines, tempReportId, approvedReportId = null) {
  const validRows = Array.isArray(approvedRows)
    && approvedRows.every((row) => row !== null && typeof row === "object" && !Array.isArray(row));
  const byInsertOrder = validRows
    ? [...approvedRows].sort((a, b) => Number(a.id) - Number(b.id))
    : [];
  const parseStrictId = (value) => {
    if (typeof value !== "number" && (typeof value !== "string" || !/^[0-9]+$/.test(value))) return null;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  };
  const ids = byInsertOrder.map((row) => parseStrictId(row.id));
  const hasInvalidIds = ids.some((id) => id === null) || new Set(ids).size !== ids.length;
  // Machine/product codes alone cannot distinguish repeated runs of the same product.
  // Check persisted source identities too, when supplied by the database.
  const identityColumns = ["machine_event_id", "machine_id", "product_standard_id",
    "standard_version_id", "machine_standard_id"];
  const identityMismatch = (persisted, source) => identityColumns.some((column) =>
    (column !== "machine_event_id" || Boolean(source.machine_event_id))
      && Object.prototype.hasOwnProperty.call(persisted, column)
      && Object.prototype.hasOwnProperty.call(source, column)
      && String(persisted[column] || "") !== String(source[column] || ""));
  // sort_order is copied with a legacy default of 1. It distinguishes otherwise
  // identical machine/product runs and must survive the bulk INSERT unchanged.
  const sortOrderMismatch = (persisted, source) => {
    if (!Object.prototype.hasOwnProperty.call(persisted, "sort_order")
      || !Object.prototype.hasOwnProperty.call(source, "sort_order")) return false;
    // The INSERT uses source.sort_order || 1; the persisted value must still be
    // a positive safe integer, not a coerced boolean, exponent or fractional ID.
    const expected = parseStrictId(source.sort_order || 1);
    const actual = parseStrictId(persisted.sort_order);
    return expected === null || actual === null || actual !== expected;
  };
  // Decimal values may be returned as strings with trailing zeros by TiDB.
  // Normalize textually to avoid losing DECIMAL(18,6) precision through Number().
  const canonicalDecimal = (value) => {
    const raw = String(value ?? "").trim();
    if (!/^[+-]?(?:[0-9]+)(?:[.][0-9]+)?$/.test(raw)) return null;
    const negative = raw.startsWith("-");
    const unsigned = raw.replace(/^[+-]/, "");
    const [integer, fraction = ""] = unsigned.split(".");
    const whole = integer.replace(/^0+/, "") || "0";
    const decimal = fraction.replace(/0+$/, "");
    const magnitude = whole + (decimal ? "." + decimal : "");
    return (negative && magnitude !== "0" ? "-" : "") + magnitude;
  };
  const quantityColumns = ["machine_time_hours", "standard_output", "standard_time_seconds",
    "ok_quantity", "ng_quantity", "maximum_output", "deduction_time_hours",
    "counted_output", "earned_standard_hours"];
  const quantityMismatch = (persisted, source) => quantityColumns.some((column) => {
    if (!Object.prototype.hasOwnProperty.call(persisted, column)
      || !Object.prototype.hasOwnProperty.call(source, column)) return false;
    const saved = ["deduction_time_hours", "counted_output", "earned_standard_hours"].includes(column)
      ? source[column] || 0 : source[column];
    // The approved INSERT stores absent standard_time_seconds as SQL NULL.
    if (column === "standard_time_seconds" && !saved && persisted[column] == null) return false;
    const actual = canonicalDecimal(persisted[column]);
    const expected = canonicalDecimal(saved);
    return actual === null || expected === null || actual !== expected;
  });
  // A changed standard source can silently alter historical rate/audit lineage.
  // Compare the exact normalized code written by buildApprovedMachineLineValues.
  const standardSourceMismatch = (persisted, source) =>
    Object.prototype.hasOwnProperty.call(persisted, "standard_source")
      && Object.prototype.hasOwnProperty.call(source, "standard_source")
      && String(persisted.standard_source) !== storedStandardSource(source.standard_source);
  const wrongReportLineage = approvedReportId != null && byInsertOrder.some((row) =>
    !Object.prototype.hasOwnProperty.call(row, "report_id")
      || parseStrictId(row.report_id) === null
      || parseStrictId(row.report_id) !== parseStrictId(approvedReportId));
  if (!validRows
    || byInsertOrder.length !== tempLines.length
    || hasInvalidIds
    || wrongReportLineage
    || byInsertOrder.some((row, index) => String(row.machine_code) !== String(tempLines[index].machine_code)
      || String(row.product_code) !== String(tempLines[index].product_code)
      || identityMismatch(row, tempLines[index])
      || sortOrderMismatch(row, tempLines[index])
      || quantityMismatch(row, tempLines[index])
      || standardSourceMismatch(row, tempLines[index]))) {
    const error = new Error(`Không xác nhận được dòng máy đã sao chép cho báo cáo tạm #${tempReportId}; đã hủy duyệt để bảo vệ dữ liệu`);
    error.status = 500;
    error.code = "APPROVED_MACHINE_LINES_COPY_MISMATCH";
    error.isPublic = true;
    throw error;
  }

  return byInsertOrder;
}

// Copies the temp machine lines (and their defects) into the approved report.
// Subrequest budget: one multi-row INSERT for all lines + one SELECT to learn the new ids (the caller
// reuses those rows for the legacy snapshot and the approved version) + one INSERT for all defects,
// instead of one INSERT per machine line.
async function copyMachineLinesToApproved(tempReportId, approvedReportId, connection, preloadedTempLines = null) {
  const tempLines = preloadedTempLines || await getTempMachineLines(tempReportId, connection);
  if (!tempLines.length) return { ids: [], rows: [] };

  const { sql: machineInsertSql, params: machineInsertParams } = buildApprovedMachineLinesInsert(tempLines, approvedReportId);
  await query(connection, machineInsertSql, machineInsertParams);

  const { sql: approvedLinesSql, params: approvedLinesParams } = buildApprovedMachineLinesRead(approvedReportId);
  const approvedRows = await qRows(connection, approvedLinesSql, approvedLinesParams);
  // AUTO_INCREMENT hands out ascending ids in row order inside one statement, so the n-th inserted row is the
  // n-th lowest id. Verify that assumption against machine_code/product_code and fail closed (rollback) if not.
  const byInsertOrder = verifyApprovedMachineLineCopy(approvedRows, tempLines, tempReportId, approvedReportId);

  const pendingDefects = buildApprovedMachineDefectRows(tempLines, byInsertOrder);

  if (pendingDefects.length) {
    const { sql: defectInsertSql, params: defectInsertParams } = buildApprovedMachineDefectsInsert(pendingDefects);
    await query(connection, defectInsertSql, defectInsertParams);
  }

  return { ids: byInsertOrder.map((row) => Number(row.id)), rows: approvedRows };
}

// Keep standard resolver warm-up input aligned with each saved machine line.
function buildMachineStandardWarmUpItems(tempLines) {
  return tempLines.map((line) => ({
    machineId: line.machine_id,
    machineCode: line.machine_code,
    productCode: line.product_code,
  }));
}

// Preserve the saved machine-line standard identity used for approval checks.
function buildMachineStandardResolutionInput(item, line) {
  return {
    processId: item.process_id,
    productCode: line.product_code,
    machineId: line.machine_id,
    machineCode: line.machine_code,
    workDate: item.work_date,
    standardVersionId: line.standard_version_id,
    machineStandardId: line.machine_standard_id,
  };
}

// Keep the saved standard snapshot fields identical for machine lines and reports.
function buildStandardSnapshotConsistencyInput(saved, resolved) {
  return {
    resolved,
    standardOutput: saved.standard_output,
    standardVersionId: saved.standard_version_id,
    machineStandardId: saved.machine_standard_id,
  };
}

// Validate machine report snapshots before any approval copy occurs.
function createMissingMachineSnapshotError(reportId) {
  const error = new Error(`Báo cáo máy #${reportId} không có dòng máy để xác minh định mức`);
  error.status = 422;
  error.code = "STANDARD_SNAPSHOT_MISSING";
  error.isPublic = true;
  return error;
}

async function validateMachineApprovalSnapshot(item, connection, standardResolver, tempLinesCache) {
  const tempLines = await getTempMachineLines(item.id, connection);
  if (tempLinesCache) tempLinesCache.set(Number(item.id), tempLines);
  if (!tempLines.length) {
    throw createMissingMachineSnapshotError(item.id);
  }
  const eventContext = await prepareApprovedEventContext(connection, { report: item, lines: tempLines });
  await standardResolver.warmUp({
    processId: item.process_id,
    workDate: item.work_date,
    items: buildMachineStandardWarmUpItems(tempLines),
  });
  for (const line of tempLines) {
    await assertApprovedEventForTempLine(connection, { report: item, line, context: eventContext });
    const resolved = await standardResolver.resolveStandard(buildMachineStandardResolutionInput(item, line));
    assertStandardSnapshotConsistency(buildStandardSnapshotConsistencyInput(line, resolved));
  }
  return;
}

// Resolve the report-level saved standard, including the manual GC Cắt/Lồng choice.
function buildReportStandardResolutionInput(item) {
  return {
    processId: item.process_id,
    productCode: item.product_name,
    workDate: item.work_date,
    standardVersionId: item.standard_version_id,
    machineStandardId: item.machine_standard_id,
    // GC manual (no machine): the report's saved Cắt/Lồng choice; null for every other process.
    workType: explicitGcWorkType({ isGc: Number(item.process_id) === 1, operationType: item.operation_type }),
  };
}

function isMachineApprovalReport(item) {
  return String(item.operation_mode || "").toUpperCase() === "MACHINE";
}

async function validateApprovalSnapshot(item, connection, standardResolver, tempLinesCache = null) {
  const isMachineReport = isMachineApprovalReport(item);
  if (!isMachineReport && isParentProcessNonProductWork(item)) {
    assertNonProductWorkSnapshot(item);
    return;
  }
  if (isMachineReport) {
    await validateMachineApprovalSnapshot(item, connection, standardResolver, tempLinesCache);
    return;
  }

  const resolved = await standardResolver.resolveStandard(buildReportStandardResolutionInput(item));
  // CVK "Công việc khác" reports intentionally have no product standard.
  // Their valid snapshot is zero output with no product/machine standard IDs.
  if (resolved?.nonProductWork) {
    if (hasNonProductSnapshotMismatch(item)) {
      throw createNonProductSnapshotMismatchError("Ảnh chụp công việc khác không hợp lệ; cần kiểm tra lại báo cáo");
    }
    return;
  }

  assertStandardSnapshotConsistency(buildStandardSnapshotConsistencyInput(item, resolved));
}

// Keep the approved v1 legacy snapshot payload stable for exports and audit history.
// Preserve the exact v1 legacy snapshot projection of preloaded approved rows.
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





function buildApprovedMachineLinesInsert(tempLines, approvedReportId) {
  const columns = `report_id,machine_event_id,machine_id,machine_code,product_standard_id,standard_version_id,machine_standard_id,product_code,
        machine_time_hours,standard_output,standard_time_seconds,standard_source,ok_quantity,ng_quantity,
        maximum_output,deduction_time_hours,deductions_json,counted_output,earned_standard_hours,defects_json,sort_order`;
  const rowPlaceholder = `(${new Array(21).fill("?").join(",")})`;
  return {
    sql: `INSERT INTO production_report_machine_lines (${columns}) VALUES ${tempLines.map(() => rowPlaceholder).join(",")}`,
    params: buildApprovedMachineLineValues(tempLines, approvedReportId),
  };
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
