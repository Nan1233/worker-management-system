'use strict';
const { publicError } = require('../utils/httpError');

const clampInt = (value, fallback, min, max) => {
  const n = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

const normalizeDate = (value, fallback) => {
  const text = String(value ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : fallback;
};

function normalizeApprovedReportFilters(query = {}) {
    const page = clampInt(query.page, 1, 1, 100000);
    const pageSize = clampInt(query.page_size ?? query.pageSize, 20, 1, 100);
    const offset = (page - 1) * pageSize;
    const dateFrom = normalizeDate(query.date_from ?? query.dateFrom, '0001-01-01');
    const dateTo = normalizeDate(query.date_to ?? query.dateTo, '9999-12-31');
    const processId = query.process_id ?? query.processId;
    const processName = String(query.process_name ?? query.processName ?? '').trim().slice(0, 120);
    const shift = String(query.shift ?? '').trim().slice(0, 20);
    const search = String(query.search ?? '').trim().slice(0, 120);

    if (dateFrom > dateTo) {
      throw publicError('Khoảng ngày báo cáo không hợp lệ', 400, 'INVALID_DATE_RANGE');
    }

    if (processId !== undefined && processId !== null && String(processId).trim() !== '') {
      const id = Number(processId);
      if (!Number.isInteger(id) || id <= 0) throw publicError('Công đoạn không hợp lệ', 400, 'INVALID_PROCESS_ID');
    }
    return {page,pageSize,offset,dateFrom,dateTo,processId,processName,shift,search,includeMeta:String(query.include_meta ?? '1') !== '0'};
}
module.exports = { normalizeApprovedReportFilters };
