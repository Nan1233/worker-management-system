'use strict';
const approvalModel = require('../models/productionTempApprovalModel');
const { buildApprovalSelection } = require('../models/productionTempApprovalSelection');
const { createStandardResolver } = require('./standardResolutionService');
const {
  assertLegacyRepairAuthorized, ensureLegacyMachineLines, repairMachineLineReferences,
  linkMatchingApprovedMachineEvents, loadAlreadyApproved,
} = require('../repositories/productionReviewLegacyRepository');

const approvalStage = async (name, task) => {
  const started = Date.now();
  console.log(`[KTC][APPROVAL_TRACE] START ${name}`);
  try {
    const result = await task();
    console.log(`[KTC][APPROVAL_TRACE] END ${name} ms=${Date.now() - started}`);
    return result;
  } catch (error) {
    console.error(`[KTC][APPROVAL_TRACE] ERROR ${name} ms=${Date.now() - started} code=${error?.code || ''} message=${String(error?.message || error).slice(0, 300)}`);
    throw error;
  }
};

const approvalQueues = new Map();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isLockWaitTimeout = (error) => Number(error?.errno) === 1205 || /lock wait timeout exceeded|error 1205/i.test(String(error?.message || ""));

function approvalQueueKey(targets) {
  return [...new Set((Array.isArray(targets) ? targets : [])
    .map((item) => typeof item === "object" ? item?.id : item)
    .map(Number)
    .filter((id) => Number.isSafeInteger(id) && id > 0))]
    .sort((a, b) => a - b)
    .join(",");
}

async function approveSelectedSerialized(targets, reviewerId, isAdmin) {
  const key = approvalQueueKey(targets);
  const previous = approvalQueues.get(key) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  approvalQueues.set(key, current);
  await previous;
  try {
    const { reportIds, expectedById } = buildApprovalSelection(targets);

    // A versioned approval is not an idempotent retry: returning a previous
    // result would silently bypass the caller's optimistic-lock token.
    const hasVersionGuard = targets.some((item) => item && typeof item === 'object' && item.expected_updated_at != null);
    if (!hasVersionGuard) {
      const alreadyApproved = await loadAlreadyApproved(reportIds);
      if (alreadyApproved) return alreadyApproved;
    }

    // Authorization must precede legacy repair because those repairs write
    // outside the approval transaction. The transaction revalidates scope and
    // optimistic versions after repairs before any approved-row insert.
    await assertLegacyRepairAuthorized(reportIds, expectedById, reviewerId, isAdmin);

    // Keep legacy repair inside the same per-selection queue. Previously it
    // ran before serialization and two requests could repair the same rows
    // concurrently, outside the approval transaction.
    await approvalStage("ensureLegacyMachineLines", () => ensureLegacyMachineLines(targets, createStandardResolver));
    await approvalStage("repairMachineLineReferences", () => repairMachineLineReferences(targets));
    await approvalStage("linkMatchingApprovedMachineEvents", () => linkMatchingApprovedMachineEvents(targets));

    for (const delay of [0, 250, 750]) {
      if (delay) await sleep(delay);
      try {
        return await approvalModel.approveSelected(targets, reviewerId, isAdmin);
      } catch (error) {
        if (!isLockWaitTimeout(error)) throw error;
        if (!hasVersionGuard) {
          const recovered = await loadAlreadyApproved(reportIds);
          if (recovered) return recovered;
        }
      }
    }
    const error = new Error("Yêu cầu duyệt báo cáo đang bị yêu cầu khác xử lý. Vui lòng thử lại.");
    error.status = 409;
    error.code = "APPROVAL_CONCURRENT_CONFLICT";
    error.isPublic = true;
    throw error;
  } finally {
    release();
    if (approvalQueues.get(key) === current) approvalQueues.delete(key);
  }
}

module.exports = {
  ...approvalModel,
  async approveSelected(targets, reviewerId, isAdmin = false) {
    // Validate the entire selection before legacy repair writes or any queue
    // recovery. Invalid targets must not mutate machine-line references.
    buildApprovalSelection(targets);
    return approvalStage("approveSelectedSerialized", () => approveSelectedSerialized(targets, reviewerId, isAdmin));
  },
};