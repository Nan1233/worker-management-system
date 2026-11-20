'use strict';

// Pure production-domain rules for non-product-work classification and
// immutable zero-standard snapshots. Error codes/messages remain public APIs.
function getExtraDataObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value === "string") {
    try { const parsed = JSON.parse(value); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}; }
    catch { return {}; }
  }
  return {};
}

function isParentProcessNonProductWork(item) {
  const extra = getExtraDataObject(item?.extra_data);
  return extra.non_product_work === true
    && Number(item?.process_id) !== 30002
    && Number(item?.process_id) !== 60006;
}

// Shared zero-standard predicate; each caller retains its own public error message.
function hasNonProductSnapshotMismatch(item) {
  const output = Number(item?.standard_output || 0);
  const versionId = Number(item?.standard_version_id || 0);
  const machineStandardId = Number(item?.machine_standard_id || 0);
  return output !== 0 || versionId !== 0 || machineStandardId !== 0;
}

function createNonProductSnapshotMismatchError(message) {
  const error = new Error(message);
  error.status = 422;
  error.code = "NON_PRODUCT_WORK_SNAPSHOT_MISMATCH";
  error.isPublic = true;
  return error;
}

function assertNonProductWorkSnapshot(item) {
  if (hasNonProductSnapshotMismatch(item)) {
    throw createNonProductSnapshotMismatchError("Ảnh chụp công việc khác trong công đoạn không hợp lệ; cần kiểm tra lại báo cáo");
  }
}


module.exports = {
  isParentProcessNonProductWork,
  hasNonProductSnapshotMismatch,
  createNonProductSnapshotMismatchError,
  assertNonProductWorkSnapshot,
};
