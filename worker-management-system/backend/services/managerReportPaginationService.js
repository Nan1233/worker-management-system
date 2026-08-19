const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const MAX_SEARCH_LENGTH = 120;
const MAX_REVIEW_BATCH_SIZE = 100;

function publicValidationError(code, message) {
  const error = new Error(message);
  error.status = 400;
  error.code = code;
  error.isPublic = true;
  return error;
}

function parsePositiveInt(value, fallback, field) {
  if (value === undefined || value === null || value === '') return fallback;
  const raw = String(value).trim();
  if (!/^\d+$/.test(raw)) throw publicValidationError('PAGINATION_INVALID', `${field} không hợp lệ`);
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw publicValidationError('PAGINATION_INVALID', `${field} không hợp lệ`);
  return parsed;
}

function normalizePagination(input = {}) {
  const page = parsePositiveInt(input.page, 1, 'page');
  const pageSize = parsePositiveInt(input.page_size ?? input.pageSize, DEFAULT_PAGE_SIZE, 'page_size');
  if (pageSize > MAX_PAGE_SIZE) {
    throw publicValidationError('PAGE_SIZE_TOO_LARGE', `page_size tối đa là ${MAX_PAGE_SIZE}`);
  }
  const offset = (page - 1) * pageSize;
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw publicValidationError('PAGINATION_INVALID', 'Khoảng phân trang không hợp lệ');
  }
  return { page, pageSize, offset };
}

function normalizeSearch(value) {
  const search = String(value || '').trim();
  if (!search) return null;
  if (search.length > MAX_SEARCH_LENGTH) {
    throw publicValidationError('SEARCH_TOO_LONG', `Từ khóa tìm kiếm tối đa ${MAX_SEARCH_LENGTH} ký tự`);
  }
  return search;
}

function paginationMeta({ page, pageSize, total }) {
  const safeTotal = Math.max(0, Number(total) || 0);
  return {
    page,
    page_size: pageSize,
    total: safeTotal,
    total_pages: Math.max(1, Math.ceil(safeTotal / pageSize))
  };
}

function assertReviewBatchSize(targets) {
  const size = Array.isArray(targets) ? targets.length : 0;
  if (size > MAX_REVIEW_BATCH_SIZE) {
    throw publicValidationError(
      'REVIEW_BATCH_TOO_LARGE',
      `Mỗi lần chỉ được xử lý tối đa ${MAX_REVIEW_BATCH_SIZE} báo cáo`
    );
  }
  return size;
}

module.exports = {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MAX_SEARCH_LENGTH,
  MAX_REVIEW_BATCH_SIZE,
  normalizePagination,
  normalizeSearch,
  paginationMeta,
  assertReviewBatchSize
};
