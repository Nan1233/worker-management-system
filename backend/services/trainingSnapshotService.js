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

async function resolveInitialTrainingSnapshot({ workerId, query }) {
  const id = Number(workerId);
  if (!Number.isInteger(id) || id <= 0 || typeof query !== 'function') {
    throw httpTrainingError('Không xác định được nhân viên để chụp % học việc', 'TRAINING_SNAPSHOT_WORKER_REQUIRED');
  }
  const rows = await query(
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
