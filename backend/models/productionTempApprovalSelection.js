const { normalizeIds } = require("./productionTempModelShared");

// Keep input normalization and duplicate-ID precedence identical to approval's original path.
function buildApprovalSelection(targets) {
  const normalizedTargets = Array.isArray(targets)
    ? targets.map((item) => item !== null && typeof item === "object" ? item : { id: item, expected_updated_at: null })
    : [];
  const reportIds = normalizeIds(normalizedTargets.map((item) => item.id));
  if (!reportIds.length || normalizedTargets.some((item) =>
    (typeof item.id !== "number" && (typeof item.id !== "string" || !/^[0-9]+$/.test(item.id)))
    || !Number.isSafeInteger(Number(item.id)) || Number(item.id) <= 0)) {
    throw new Error("Danh sách báo cáo không hợp lệ");
  }
  const expectedById = new Map();
  for (const item of normalizedTargets) {
    const id = Number(item.id);
    const supplied = item.expected_updated_at;
    const expected = supplied == null || supplied === "" ? null : supplied;
    // A supplied version must be a date/string, not a coerced number, boolean or array.
    if (expected !== null && !(typeof expected === "string" || expected instanceof Date)) {
      throw createTempReportVersionConflictError(id);
    }
    // Invalid timestamps must not silently disable the optimistic concurrency check (NaN !== NaN).
    if (expected !== null && !Number.isFinite(new Date(expected).getTime())) {
      throw createTempReportVersionConflictError(id);
    }
    // Missing duplicate timestamps cannot clear a guard; conflicting guards must fail closed.
    const previous = expectedById.get(id);
    if (previous && expected && new Date(previous).getTime() !== new Date(expected).getTime()) {
      throw createTempReportVersionConflictError(id);
    }
    if (expected || !expectedById.has(id)) expectedById.set(id, expected);
  }
  return { reportIds, expectedById };
}

function createApprovalSelectionStaleError(reportIds, missingIds) {
  const error = new Error(
    "Danh sách báo cáo đã thay đổi hoặc có báo cáo không còn trong phạm vi phê duyệt. Hãy tải lại danh sách rồi chọn lại."
  );
  error.status = 409;
  error.code = "APPROVAL_SELECTION_STALE";
  error.isPublic = true;
  error.details = { requested_ids: reportIds, missing_ids: missingIds };
  return error;
}

function createTempReportVersionConflictError(reportId) {
  const error = new Error(`Báo cáo #${reportId} đã thay đổi sau khi bạn mở danh sách. Hãy tải lại trước khi thử lại.`);
  error.status = 409;
  error.code = "TEMP_REPORT_VERSION_CONFLICT";
  error.isPublic = true;
  return error;
}

function assertApprovalSelectionVisible(rows, reportIds) {
  const visibleIds = new Set(rows.map((row) => Number(row.id)));
  const missingIds = reportIds.filter((id) => !visibleIds.has(Number(id)));
  if (rows.length !== reportIds.length || visibleIds.size !== rows.length || missingIds.length) {
    throw createApprovalSelectionStaleError(reportIds, missingIds);
  }
}

function assertApprovalSelectionVersions(rows, expectedById) {
  for (const row of rows) {
    const expected = expectedById.get(Number(row.id));
    if (expected && (!Number.isFinite(new Date(row.updated_at).getTime())
      || new Date(expected).getTime() !== new Date(row.updated_at).getTime())) {
      throw createTempReportVersionConflictError(row.id);
    }
  }
}

module.exports = {
  buildApprovalSelection,
  assertApprovalSelectionVisible,
  assertApprovalSelectionVersions,
};
