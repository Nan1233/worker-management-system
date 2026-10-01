'use strict';

const Module = require('node:module');
const ExcelJS = require('exceljs');

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

function pruneProcessSheet(sheet) {
  if (!sheet || sheet.rowCount < 5) return;

  const removeHeaders = new Set(['TONG SP QUY DOI', 'TRANG THAI', 'GHI CHU', 'ID']);
  const removeColumns = [];
  for (let col = 1; col <= sheet.columnCount; col += 1) {
    if (removeHeaders.has(normalizeHeader(sheet.getCell(5, col).value))) removeColumns.push(col);
  }
  for (let i = removeColumns.length - 1; i >= 0; i -= 1) {
    sheet.spliceColumns(removeColumns[i], 1);
  }

  const trainingCol = columnByHeader(sheet, '% HOC VIEC');
  const standardCol = columnByHeader(sheet, 'DINH MUC');
  const actualTimeCol = columnByHeader(sheet, 'THOI GIAN THUC TE');
  if (!trainingCol || !standardCol || !actualTimeCol) return;

  for (let row = 6; row <= sheet.rowCount; row += 1) {
    const training = Number(sheet.getCell(row, trainingCol).value);
    const standardPerHour = Number(sheet.getCell(row, standardCol).value);
    const actualTime = Number(sheet.getCell(row, actualTimeCol).value);
    if (!Number.isFinite(training) || !Number.isFinite(standardPerHour) || !Number.isFinite(actualTime)) continue;
    sheet.getCell(row, standardCol).value = training * standardPerHour * actualTime;
  }
}

function assertOnlyExpectedSheet(workbook, sheetName) {
  const sheets = workbook.worksheets;
  if (sheets.length !== 1 || sheets[0].name !== sheetName) {
    const names = sheets.map((sheet) => sheet.name).join(', ');
    throw new Error(`GC workbook phải chỉ có 1 sheet (${sheetName}), thực tế: ${names || '(none)'}`);
  }
}

async function leanGcProcessWorkbook(mod, args) {
  const code = 'GC';
  const config = mod.PROCESS_SHEETS[code];
  const payload = args?.payload || {};
  const date = args?.date;
  const yearMonth = String(payload.yearMonth || date || '').slice(0, 7);
  const processData = payload.processes?.[code] || {};

  // Workbook mới hoàn toàn: GC chỉ tạo đúng 1 sheet CẮT LỒNG.
  // Không dùng workbook mẫu, không tạo BÌA/TỔNG HỢP rồi xóa sau.
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'KTC Production Control';
  workbook.created = new Date();
  workbook.modified = new Date();

  const source = payload?.formulaSettings || {};
  const settings = source[code] || source.GLOBAL || {};

  // Không dùng border-dedup interceptor. Việc đọc lại border của từng cell
  // trước mỗi lần ghi làm chậm đáng kể workbook GC lớn (~2k dòng).
  const result = mod._private.renderProcessSheet(
    workbook,
    code,
    config,
    processData,
    yearMonth,
    settings
  );

  const processSheet = workbook.getWorksheet(config.sheet);
  if (!processSheet) throw new Error(`Không tạo được sheet ${config.sheet}`);

  pruneProcessSheet(processSheet);
  assertOnlyExpectedSheet(workbook, config.sheet);

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return {
    buffer,
    result,
    processCode: code,
    processName: config.title,
    fileName: mod.processWorkbookFileName(code, date, payload),
    formulaReplacementCount: 0
  };
}

async function leanSplitMonthlyWorkbooks(mod, args) {
  const payload = args?.payload || {};
  const processes = [];

  for (const code of Object.keys(mod.PROCESS_SHEETS)) {
    const processData = payload.processes?.[code];
    if (!Array.isArray(processData?.reports) || processData.reports.length === 0) continue;

    if (code === 'GC') {
      processes.push(await leanGcProcessWorkbook(mod, args));
    } else {
      processes.push(await mod.__ktcOriginalBuildProcess({ ...args, processCode: code }));
    }
  }

  return { summary: null, processes };
}

function patchMonthlyModule(mod) {
  if (!mod || mod.__ktcExcelExportPatched) return mod;

  if (typeof mod.buildProcessWorkbookLocal === 'function') {
    Object.defineProperty(mod, '__ktcOriginalBuildProcess', {
      value: mod.buildProcessWorkbookLocal,
      configurable: false,
      enumerable: false,
      writable: false
    });
  }

  if (typeof mod.buildSplitMonthlyWorkbooksLocal === 'function') {
    mod.buildSplitMonthlyWorkbooksLocal = async (args) => leanSplitMonthlyWorkbooks(mod, args);
  }

  if (typeof mod.buildProcessWorkbookLocal === 'function') {
    mod.buildProcessWorkbookLocal = async (args) => {
      if (String(args?.processCode || '').trim().toUpperCase() === 'GC') {
        return leanGcProcessWorkbook(mod, args);
      }
      return mod.__ktcOriginalBuildProcess(args);
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