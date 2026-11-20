'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');

// Legacy company/process downloads stay available but are not automatically invoked.
function createExcelApiClient({
  API_BASE_URL, REQUEST_TIMEOUT_MS, DOWNLOAD_RETRY_COUNT, RETRY_DELAY_MS,
  authenticatedFetch, writeLog, normalizeError, parseDownloadFileName,
  normalizeProcessInfo, getExportRoot, safeFileName, safeFolderName,
  getCompanyMonthTarget, buildCompanyExcelLocal, getProcessExportPath, getAppPath, wait,
}) {
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

async function fetchProcesses(date) {
  const response = await authenticatedFetch(
    `${API_BASE_URL}/reports/export-excel/processes?date=${encodeURIComponent(date)}`,
    { method: 'GET' }
  );
  if (response.status === 401 || response.status === 403) throw new Error('Phiên đăng nhập đã hết hạn hoặc không có quyền xuất Excel.');
  if (!response.ok) throw new Error(await readApiError(response));
  const payload = await response.json();
  return Array.isArray(payload.data) ? payload.data : [];
}

async function fetchCompanyFiles(token, date) {
  const response = await fetchWithTimeout(
    `${API_BASE_URL}/reports/export-excel/company-files?date=${encodeURIComponent(date)}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
  );
  if (response.status === 401 || response.status === 403) throw new Error('Phiên đăng nhập đã hết hạn hoặc không có quyền xuất Excel.');
  if (response.status === 404) {
    // Tương thích khi Cloudflare Workers chưa hỗ trợ endpoint danh sách file.
    // Vẫn thử xuất hai workbook chuẩn; endpoint POST sẽ cho biết backend đã
    // được deploy đầy đủ hay chưa.
    await writeLog('WARN', 'COMPANY_FILE_LIST_404_USING_DEFAULT_GROUPS', { date });
    return [
      { code: 'GIA_CONG', title: 'Gia công', reportCount: 0 },
      { code: 'MAI_DO', title: 'Mài - Đo', reportCount: 0 }
    ];
  }
  if (!response.ok) throw new Error(await readApiError(response));
  const payload = await response.json();
  const rows = Array.isArray(payload.data) ? payload.data : [];
  return rows.length ? rows : [
    { code: 'GIA_CONG', title: 'Gia công', reportCount: 0 },
    { code: 'MAI_DO', title: 'Mài - Đo', reportCount: 0 }
  ];
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

async function downloadConsolidatedExcelOnce(token, date) {
  const response = await fetchWithTimeout(`${API_BASE_URL}/reports/export-excel`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/json'
    },
    body: JSON.stringify({ date })
  });
  if (response.status === 401 || response.status === 403) {
    throw new Error('Phiên đăng nhập đã hết hạn hoặc không có quyền xuất Excel.');
  }
  if (!response.ok) throw new Error(await readApiError(response));

  const contentType = response.headers.get('content-type') || '';
  const buffer = Buffer.from(await response.arrayBuffer());
  const isZip = buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
  if (!contentType.includes('spreadsheetml') || !isZip) {
    throw new Error('Backend không trả file Excel tổng hợp hợp lệ.');
  }

  const [year, month] = date.split('-');
  const fallback = `Bao-cao-san-xuat-${month}-${year}.xlsx`;
  const fileName = parseDownloadFileName(response, fallback);
  const folder = path.join(getExportRoot(), year, 'Tong hop');
  await fs.mkdir(folder, { recursive: true });
  return { buffer, folder, filePath: path.join(folder, safeFileName(fileName, fallback)), fileName };
}


async function downloadConsolidatedExcel(token, date) {
  let lastError;
  for (let attempt = 1; attempt <= DOWNLOAD_RETRY_COUNT; attempt += 1) {
    try {
      return await downloadConsolidatedExcelOnce(token, date);
    } catch (error) {
      lastError = error;
      await writeLog('WARN', 'CONSOLIDATED_DOWNLOAD_RETRY', {
        attempt,
        maxAttempts: DOWNLOAD_RETRY_COUNT,
        ...normalizeError(error)
      });
      if (attempt < DOWNLOAD_RETRY_COUNT) await wait(RETRY_DELAY_MS * attempt);
    }
  }
  throw lastError;
}

async function buildCompanyExcelOnDesktop(date, fileInfo, companyData) {
  const [year, month] = date.split('-');
  const fallback = `${safeFolderName(fileInfo.title || fileInfo.code)}-${month}-${year}.xlsx`;
  const expectedName = fileInfo.code === 'GIA_CONG'
    ? `A+B GIA CÔNG THÁNG ${month}-${year}.xlsx`
    : fileInfo.code === 'MAI_DO'
      ? `A+B MÀI - ĐO THÁNG ${month}-${year}.xlsx`
      : fallback;
  const target = await getCompanyMonthTarget({
    root: getExportRoot(),
    date,
    fileName: expectedName
  });
  const folder = target.folder;
  const existingFilePath = target.filePath;

  const built = await buildCompanyExcelLocal({
    appPath: getAppPath(),
    date,
    groupCode: fileInfo.code,
    payload: companyData,
    existingFilePath
  });
  const requestedYearMonth = date.slice(0, 7);
  if (built.requestedYearMonth !== requestedYearMonth) {
    throw new Error(`Workbook ${fileInfo.title} sai kỳ: yêu cầu ${requestedYearMonth}, nhận ${built.requestedYearMonth || 'trống'}`);
  }
  const fileName = built.fileName || expectedName;
  return {
    buffer: built.buffer,
    folder,
    filePath: path.join(folder, safeFileName(fileName, fallback)),
    fileName,
    reusedExistingFile: false,
    requestedYearMonth: built.requestedYearMonth,
    periodReplacementCount: Number(built.periodReplacementCount || 0)
  };
}

async function downloadProcessExcel(token, date, rawProcessInfo, attempt = 1) {
  const processInfo = normalizeProcessInfo(rawProcessInfo);
  if (!Number.isFinite(processInfo.id) || processInfo.id <= 0) {
    throw new Error(`Thiếu processId hợp lệ cho công đoạn ${processInfo.processName || processInfo.processCode || 'không xác định'}.`);
  }

  const response = await fetchWithTimeout(`${API_BASE_URL}/reports/export-excel/process`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/json'
    },
    body: JSON.stringify({ date, processId: Number(processInfo.id) })
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error('Phiên đăng nhập đã hết hạn hoặc không có quyền xuất Excel.');
  }

  if (!response.ok) {
    const retryable = [429, 502, 503, 504].includes(response.status);
    const message = await readApiError(response);
    if (retryable && attempt < 4) {
      const retryAfter = Number(response.headers.get('retry-after'));
      const delayMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : Math.min(15000, 3000 * attempt);
      await writeLog('WARN', 'PROCESS_EXCEL_RETRY', {
        processId: processInfo.id,
        processCode: processInfo.processCode,
        attempt,
        status: response.status,
        delayMs,
        message
      });
      await wait(delayMs);
      return downloadProcessExcel(token, date, processInfo, attempt + 1);
    }
    throw new Error(message);
  }

  const contentType = response.headers.get('content-type') || '';
  const buffer = Buffer.from(await response.arrayBuffer());
  const isZip = buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
  if (!contentType.includes('spreadsheetml') || !isZip) {
    throw new Error(`Backend không trả file Excel hợp lệ cho công đoạn ${processInfo.processName || processInfo.id}.`);
  }

  const [year, month] = date.split('-');
  const fallback = `Bao-cao-${safeFolderName(processInfo.processCode || processInfo.processName)}-${month}-${year}.xlsx`;
  const fileName = parseDownloadFileName(response, fallback);
  const { folder, filePath } = await getProcessExportPath(date, processInfo, fileName);
  return { buffer, folder, filePath, fileName: path.basename(filePath), serverFileName: fileName };
}


return {
  fetchWithTimeout, readApiError, fetchProcesses, fetchCompanyFiles, fetchCompanyData,
  downloadConsolidatedExcelOnce, downloadConsolidatedExcel,
  buildCompanyExcelOnDesktop, downloadProcessExcel,
};
}
module.exports = { createExcelApiClient };
