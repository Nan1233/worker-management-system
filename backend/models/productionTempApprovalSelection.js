'use strict';

const { normalizeIds } = require('./productionTempIdNormalization');

function isValidReportId(id) {
  const correctType = typeof id === 'number'
    || (typeof id === 'string' && /^[0-9]+$/.test(id));
  const numericId = Number(id);
  return correctType && Number.isSafeInteger(numericId) && numericId > 0;
}

function normalizeApprovalTargets(targets) {
  if (!Array.isArray(targets)) return [];
  return targets.map((item) => (
    item !== null && typeof item === 'object'
      ? item
      : { id: item, expected_updated_at: null }
  ));
}

function normalizeExpectedVersion(value, reportId) {
  const expected = value == null || value === '' ? null : value;
  if (expected === null) return null;

  // Versions must be valid strings or dates; never silently drop an invalid guard.
  if (!(typeof expected === 'string' || expected instanceof Date)
      || !Number.isFinite(new Date(expected).getTime())) {
    throw createTempReportVersionConflictError(reportId);
  }
  return expected;
}


// Keep input normalization and duplicate-ID precedence identical to approval's original path.
function buildApprovalSelection(targets) {
  const normalizedTargets = normalizeApprovalTargets(targets);
  const reportIds = normalizeIds(normalizedTargets.map((item) => item.id));

  if (reportIds.length === 0 || normalizedTargets.some((item) => !isValidReportId(item.id))) {
    throw new Error('Danh sách báo cáo không hợp lệ');
  }

  const expectedById = new Map();
  for (const item of normalizedTargets) {
    const id = Number(item.id);
    const expected = normalizeExpectedVersion(item.expected_updated_at, id);
    const previous = expectedById.get(id);

    // Duplicate IDs cannot erase an existing version or supply a conflicting one.
    if (previous && expected && new Date(previous).getTime() !== new Date(expected).getTime()) {
      throw createTempReportVersionConflictError(id);
    }
    if (expected || !expectedById.has(id)) {
      expectedById.set(id, expected);
    }
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
