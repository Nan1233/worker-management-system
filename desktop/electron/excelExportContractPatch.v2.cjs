'use strict';

const Module = require('node:module');
const ExcelJS = require('exceljs');
const { dialog } = require('electron');

const originalLoad = Module._load;
let patchedModule = null;

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

// company-data is already sourced from the approved TiDB report endpoint.
// Older backend payloads may omit the provenance flags that the local Excel
// builder validates. Fill only missing provenance fields; never overwrite an
// explicit conflicting value.
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

Module._load = function patchedLoad(request, parent, isMain) {
  if (!patchedModule && String(request).endsWith('monthlyWorkbookLocal.cjs')) {
    const loaded = originalLoad.call(this, request, parent, isMain);
    patchedModule = patchMonthlyModule(loaded);
    return patchedModule;
  }
  return originalLoad.call(this, request, parent, isMain);
};
