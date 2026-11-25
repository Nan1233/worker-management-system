'use strict';

// Production Excel only reads approved data from the authenticated API.
function createApprovedExcelDataClient({ API_BASE_URL, REQUEST_TIMEOUT_MS, authenticatedFetch }) {
async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error(`Máy chủ phản hồi quá ${Math.round(REQUEST_TIMEOUT_MS / 1000)} giây.`);
      timeoutError.code = 'API_TIMEOUT';
      throw timeoutError;
    }
    const networkError = new Error(
      `Không kết nối được backend KTC (${API_BASE_URL}). ` +
      'Kiểm tra Internet hoặc trạng thái dịch vụ Cloudflare Workers rồi thử lại.'
    );
    networkError.code = 'API_FETCH_FAILED';
    networkError.cause = error;
    throw networkError;
  } finally {
    clearTimeout(timer);
  }
}

async function readApiError(response) {
  try {
    const type = response.headers.get('content-type') || '';
    if (type.includes('application/json')) {
      const data = await response.json();
      return data.message || data.error || JSON.stringify(data);
    }
    const text = (await response.text()).trim();
    if (!text) return `HTTP ${response.status}`;
    if (/<html|<!doctype/i.test(text)) return `HTTP ${response.status} - dịch vụ Cloudflare Workers tạm thời không khả dụng.`;
    return text.length > 500 ? `${text.slice(0, 500)}…` : text;
  } catch {
    return `HTTP ${response.status}`;
  }
}

async function fetchCompanyData(date) {
  const url = `${API_BASE_URL}/reports/export-excel/company-data?date=${encodeURIComponent(date)}`;
  const response = await authenticatedFetch(url, { method: 'GET' });
  if (response.status === 401 || response.status === 403) {
    throw new Error('Phiên đăng nhập đã hết hạn hoặc không có quyền xuất Excel.');
  }
  if (!response.ok) {
    const message = await readApiError(response);
    const error = new Error(`Backend xuất Excel lỗi: ${message}`);
    error.code = `COMPANY_DATA_HTTP_${response.status}`;
    throw error;
  }
  const payload = await response.json();
  if (!payload?.success || !payload?.data?.processes) {
    const error = new Error('Backend không trả dữ liệu Excel tháng hợp lệ.');
    error.code = 'COMPANY_DATA_INVALID_PAYLOAD';
    throw error;
  }
  return payload.data;
}

return { fetchWithTimeout, readApiError, fetchCompanyData };
}
module.exports = { createApprovedExcelDataClient };
