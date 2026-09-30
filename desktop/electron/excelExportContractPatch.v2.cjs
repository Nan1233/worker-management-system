'use strict';

const Module = require('node:module');
const ExcelJS = require('exceljs');
const { dialog } = require('electron');

const originalLoad = Module._load;
const originalFetch = globalThis.fetch;
let patchedModule = null;
const companyDataCache = new Map();
const processListCache = new Map();

function normalizeHeader(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .trim()
    .toUpperCase();
}

function columnByHeader(sheet, header) {
  const wanted = normalizeHeader(header);
  for (let col = 1; col <= sheet.columnCount; col += 1) {
    if (normalizeHeader(sheet.getCell(5, col).value) === wanted) return col;
  }
  return 0;
}

function normalizeTrainingFactor(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return numeric > 1 ? numeric / 100 : numeric;
}

async function patchProcessWorkbook(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  for (const sheet of workbook.worksheets) {
    if (sheet.state === 'veryHidden' || sheet.state === 'hidden') continue;
    if (sheet.rowCount < 5) continue;

    const removeHeaders = new Set(['TONG SP QUY DOI']);
    const removeColumns = [];
    for (let col = 1; col <= sheet.columnCount; col += 1) {
      if (removeHeaders.has(normalizeHeader(sheet.getCell(5, col).value))) removeColumns.push(col);
    }
    for (let i = removeColumns.length - 1; i >= 0; i -= 1) {
      sheet.spliceColumns(removeColumns[i], 1);
    }

    const trainingCol = columnByHeader(sheet, '% HOC VIEC');
    const standardPerHourCol = columnByHeader(sheet, 'DINH MUC/H');
    const actualTimeCol = columnByHeader(sheet, 'THOI GIAN CHAY THUC TE')
      || columnByHeader(sheet, 'THOI GIAN THUC TE');
    if (!trainingCol || !standardPerHourCol || !actualTimeCol) continue;

    sheet.getCell(5, standardPerHourCol).value = 'Định mức';

    for (let row = 6; row <= sheet.rowCount; row += 1) {
      const trainingFactor = normalizeTrainingFactor(sheet.getCell(row, trainingCol).value);
      const standardPerHour = Number(sheet.getCell(row, standardPerHourCol).value);
      const actualTime = Number(sheet.getCell(row, actualTimeCol).value);
      if (trainingFactor === null || !Number.isFinite(standardPerHour) || !Number.isFinite(actualTime)) continue;
      sheet.getCell(row, standardPerHourCol).value = trainingFactor * standardPerHour * actualTime;
    }
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function normalizeApprovedPayload(args = {}) {
  const payload = args?.payload;
  if (!payload || typeof payload !== 'object') return args;

  const processes = {};
  for (const [code, data] of Object.entries(payload.processes || {})) {
    processes[code] = {
      ...data,
      reports: (Array.isArray(data?.reports) ? data.reports : []).map((report) => ({
        ...report,
        dataSource: report?.dataSource || 'production_reports',
        isApprovedDatabaseRecord: report?.isApprovedDatabaseRecord ?? true,
      })),
    };
  }

  return {
    ...args,
    payload: {
      ...payload,
      dataSource: payload.dataSource || 'tidb.production_reports.approved',
      processes,
    },
  };
}

function errorText(error) {
  if (!error) return 'Không xác định được lỗi.';
  const message = error?.message ? String(error.message) : String(error);
  const code = error?.code ? `\nMã lỗi: ${error.code}` : '';
  const stack = error?.stack && error.stack !== message ? `\n\nSTACK:\n${String(error.stack).slice(0, 5000)}` : '';
  return `${message}${code}${stack}`;
}

async function showExcelBuildError(error, context) {
  const detail = [
    `Công đoạn: ${context?.processCode || context?.processName || 'tổng hợp'}`,
    `Kỳ: ${context?.date || 'không xác định'}`,
    '',
    'Excel KHÔNG được ghi/cập nhật.',
    '',
    errorText(error),
  ].join('\n');

  console.error('[KTC][EXCEL_BUILD_ERROR]', detail);
  try {
    await dialog.showMessageBox({
      type: 'error',
      title: 'Lỗi cập nhật Excel — dữ liệu không khớp',
      message: 'Không thể cập nhật Excel tháng.',
      detail,
      buttons: ['OK'],
      defaultId: 0,
    });
  } catch {
    // UI logging must never hide the original build error.
  }
}

function headerValue(headers, name) {
  if (!headers) return '';
  if (typeof headers.get === 'function') return headers.get(name) || '';
  return headers[name] || headers[name.toLowerCase()] || '';
}

function makeExcelResponse(buffer, fileName) {
  return new Response(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      'Cache-Control': 'private, no-store',
      'X-KTC-Excel-Backend': 'desktop-local',
    },
  });
}

async function fetchCompanyDataLocal(apiUrl, auth, date) {
  const key = `${apiUrl}|${date}`;
  if (companyDataCache.has(key)) return companyDataCache.get(key);

  const promise = (async () => {
    const response = await originalFetch(`${apiUrl}/reports/export-excel/company-data?date=${encodeURIComponent(date)}`, {
      method: 'GET',
      headers: {
        Authorization: auth,
        Accept: 'application/json',
      },
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`company-data HTTP ${response.status}${text ? `: ${text.slice(0, 500)}` : ''}`);
    }
    const json = await response.json();
    if (!json?.success || !json?.data?.processes) {
      throw new Error('Backend không trả payload company-data hợp lệ.');
    }
    return normalizeApprovedPayload({ date, payload: json.data }).payload;
  })();

  companyDataCache.set(key, promise);
  try {
    return await promise;
  } catch (error) {
    companyDataCache.delete(key);
    throw error;
  }
}

async function fetchProcessListLocal(apiUrl, auth, date) {
  const key = `${apiUrl}|${date}`;
  if (processListCache.has(key)) return processListCache.get(key);

  const promise = (async () => {
    const response = await originalFetch(`${apiUrl}/reports/export-excel/processes?date=${encodeURIComponent(date)}`, {
      method: 'GET',
      headers: {
        Authorization: auth,
        Accept: 'application/json',
      },
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`processes HTTP ${response.status}${text ? `: ${text.slice(0, 500)}` : ''}`);
    }
    const json = await response.json();
    return Array.isArray(json?.data) ? json.data : [];
  })();

  processListCache.set(key, promise);
  try {
    return await promise;
  } catch (error) {
    processListCache.delete(key);
    throw error;
  }
}

async function buildLocalExcelResponse(url, init = {}) {
  const apiUrl = new URL(url).origin + new URL(url).pathname.replace(/\/reports\/export-excel(?:\/process)?$/, '');
  const requestUrl = new URL(url);
  const body = typeof init.body === 'string' ? JSON.parse(init.body || '{}') : (init.body || {});
  const date = String(body.date || '').trim();
  if (!date) throw new Error('Thiếu ngày xuất Excel.');

  const auth = headerValue(init.headers, 'authorization');
  if (!auth) throw new Error('Thiếu token đăng nhập khi xuất Excel.');

  const payload = await fetchCompanyDataLocal(apiUrl, auth, date);
  const monthly = require('./monthlyWorkbookLocal.cjs');

  if (requestUrl.pathname.endsWith('/reports/export-excel')) {
    const built = await monthly.buildMonthlySummaryWorkbookLocal({ date, payload });
    return makeExcelResponse(built.buffer, built.fileName || `00_TONG_HOP_SAN_XUAT_${date.slice(5, 7)}-${date.slice(0, 4)}.xlsx`);
  }

  const processId = Number(body.processId);
  if (!Number.isInteger(processId) || processId <= 0) throw new Error('Thiếu processId hợp lệ khi xuất Excel công đoạn.');
  const processRows = await fetchProcessListLocal(apiUrl, auth, date);
  const processInfo = processRows.find((row) => Number(row?.id ?? row?.processId ?? row?.process_id) === processId);
  if (!processInfo) throw new Error(`Không tìm thấy công đoạn processId=${processId}.`);
  const processCode = String(processInfo.processCode ?? processInfo.process_code ?? processInfo.code ?? '').trim();
  if (!processCode) throw new Error(`Công đoạn processId=${processId} không có processCode.`);

  const built = await monthly.buildProcessWorkbookLocal({ date, payload, processCode });
  const fileName = built.fileName || `Bao-cao-${processCode}-${date.slice(5, 7)}-${date.slice(0, 4)}.xlsx`;
  return makeExcelResponse(built.buffer, fileName);
}

function installLocalExcelFetch() {
  if (globalThis.__KTC_LOCAL_EXCEL_FETCH_INSTALLED__) return;
  const original = globalThis.fetch;
  globalThis.fetch = async function ktcLocalExcelFetch(input, init = {}) {
    const url = typeof input === 'string' ? input : input?.url || '';
    const method = String(init?.method || (typeof input !== 'string' ? input?.method : 'GET') || 'GET').toUpperCase();
    if (method === 'POST' && /\/reports\/export-excel(?:\/process)?(?:\?|$)/.test(String(url))) {
      try {
        console.log('[KTC] DESKTOP_LOCAL_EXCEL_EXPORT', { url: String(url) });
        return await buildLocalExcelResponse(String(url), init);
      } catch (error) {
        console.error('[KTC] DESKTOP_LOCAL_EXCEL_EXPORT_FAILED', error);
        throw error;
      }
    }
    return original(input, init);
  };
  globalThis.__KTC_LOCAL_EXCEL_FETCH_INSTALLED__ = true;
}

function patchMonthlyModule(mod) {
  if (!mod || mod.__ktcExcelExportPatched) return mod;
  const originalSplit = mod.buildSplitMonthlyWorkbooksLocal;
  const originalProcess = mod.buildProcessWorkbookLocal;
  if (typeof originalSplit === 'function') {
    mod.buildSplitMonthlyWorkbooksLocal = async (args) => {
      try {
        const result = await originalSplit(normalizeApprovedPayload(args));
        if (Array.isArray(result?.processes)) {
          for (const process of result.processes) {
            if (process?.buffer) process.buffer = await patchProcessWorkbook(process.buffer);
          }
        }
        return result;
      } catch (error) {
        await showExcelBuildError(error, { date: args?.date });
        throw error;
      }
    };
  }
  if (typeof originalProcess === 'function') {
    mod.buildProcessWorkbookLocal = async (args) => {
      try {
        const result = await originalProcess(normalizeApprovedPayload(args));
        if (result?.buffer) result.buffer = await patchProcessWorkbook(result.buffer);
        return result;
      } catch (error) {
        await showExcelBuildError(error, {
          date: args?.date,
          processCode: args?.processCode,
          processName: args?.processName,
        });
        throw error;
      }
    };
  }
  Object.defineProperty(mod, '__ktcExcelExportPatched', { value: true });
  return mod;
}

// The Desktop EXE is the Excel engine. Cloudflare is used only for the
// authenticated approved-data API; Render is deliberately not involved in
// workbook generation anymore.
installLocalExcelFetch();

Module._load = function patchedLoad(request, parent, isMain) {
  if (!patchedModule && String(request).endsWith('monthlyWorkbookLocal.cjs')) {
    const loaded = originalLoad.call(this, request, parent, isMain);
    patchedModule = patchMonthlyModule(loaded);
    return patchedModule;
  }
  return originalLoad.call(this, request, parent, isMain);
};
