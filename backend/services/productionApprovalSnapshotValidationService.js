'use strict';
const { getTempMachineLines } = require('../repositories/productionApprovalMachineRepository');
const { explicitGcWorkType } = require('../utils/gcMachineWorkType');
const { assertStandardSnapshotConsistency } = require('./standardResolutionService');
const {
  assertApprovedEventForTempLine, prepareApprovedEventContext,
} = require('./machineProductionEventService');
const {
  isParentProcessNonProductWork, hasNonProductSnapshotMismatch,
  createNonProductSnapshotMismatchError, assertNonProductWorkSnapshot,
} = require('../modules/production/domain/nonProductSnapshot');

// Validation must finish before approved inserts; historic standard snapshots fail closed.
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

module.exports = {
  validateApprovalSnapshot, validateMachineApprovalSnapshot,
  buildMachineStandardWarmUpItems, buildMachineStandardResolutionInput,
  buildStandardSnapshotConsistencyInput, buildReportStandardResolutionInput,
};
