'use strict';

const { normalizeTrainingPercent } = require('../utils/trainingPercent');

function httpTrainingError(message, code = 'TRAINING_SNAPSHOT_UNAVAILABLE', status = 422) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  error.isPublic = true;
  return error;
}

function normalizeSnapshot(value, defaultPercent = 100) {
  return normalizeTrainingPercent(value, defaultPercent);
}

function hasTrainingSnapshot(report = {}) {
  return report.training_percent_snapshot !== null
    && report.training_percent_snapshot !== undefined
    && String(report.training_percent_snapshot).trim() !== '';
}

function getReportTrainingSnapshot(report = {}, { allowLegacyTrainingField = false } = {}) {
  if (hasTrainingSnapshot(report)) return normalizeSnapshot(report.training_percent_snapshot);
  if (allowLegacyTrainingField && report.training_percent !== null && report.training_percent !== undefined && String(report.training_percent).trim() !== '') {
    return normalizeSnapshot(report.training_percent);
  }
  return null;
}

/**
 * Resolve the immutable training snapshot for a new report.
 *
 * Supported query boundaries:
 *  - query(sql, params): legacy/service callers
 *  - executor.query(sql, params): transactional create flow
 *
 * The worker create transaction passes its locked DB connection as `executor`.
 * Keeping the adapter here avoids silently querying the global pool and makes
 * the snapshot part of the same transaction as the report creation.
 */
async function resolveInitialTrainingSnapshot({ workerId, query, executor }) {
  const id = Number(workerId);
  if (!Number.isInteger(id) || id <= 0) {
    throw httpTrainingError('Không xác định được nhân viên để chụp % học việc', 'TRAINING_SNAPSHOT_WORKER_REQUIRED');
  }

  let runQuery = query;
  if (typeof runQuery !== 'function' && executor && typeof executor.query === 'function') {
    runQuery = async (sql, params) => {
      const result = await executor.query(sql, params);
      return Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
    };
  }

  if (typeof runQuery !== 'function') {
    throw httpTrainingError('Không thể đọc thông tin % học việc', 'TRAINING_SNAPSHOT_QUERY_REQUIRED');
  }

  const rows = await runQuery(
    `SELECT training_percent FROM workers WHERE id = ? AND status = 'active' LIMIT 1`,
    [id]
  );
  if (!rows[0]) {
    throw httpTrainingError('Không tìm thấy thông tin nhân viên đang hoạt động', 'TRAINING_SNAPSHOT_WORKER_NOT_FOUND');
  }
  return normalizeSnapshot(rows[0].training_percent, 100);
}

function assertTrainingSnapshotAvailable(report = {}) {
  const value = getReportTrainingSnapshot(report);
  if (value === null) {
    throw httpTrainingError(
      'Báo cáo lịch sử chưa có snapshot % học việc; không thể tính lại KPI lịch sử một cách tin cậy',
      'TRAINING_SNAPSHOT_MISSING'
    );
  }
  return value;
}

module.exports = {
  normalizeSnapshot,
  hasTrainingSnapshot,
  getReportTrainingSnapshot,
  resolveInitialTrainingSnapshot,
  assertTrainingSnapshotAvailable
};
