'use strict';

// Desktop Excel export optimization patch.
// DB-approved data is authoritative. GC uses the existing company template
// instead of rebuilding/styling ~2,000 rows from scratch with ExcelJS.
const Module = require('node:module');
const ExcelJS = require('exceljs');
const { EXCEL_SYNC_CONTRACT_VERSION } = require('../../shared/excelSyncContract.cjs');
const { buildProcessExcelLocal } = require('./companyExcelLocal.cjs');

const originalLoad = Module._load;
const originalFetch = globalThis.fetch;

function activeProcessCodes(payload) {
  const processes = payload?.processes || {};
  return Object.entries(processes)
    .filter(([, data]) => Array.isArray(data?.reports) && data.reports.length > 0)
    .map(([code]) => String(code).trim().toUpperCase())
    .filter(Boolean);
}

// main.cjs currently references companyData after its try/catch block.
if (typeof originalFetch === 'function' && !globalThis.__KTC_COMPANY_DATA_SCOPE_FIX__) {
  globalThis.fetch = async function ktcCompanyDataScopeFetch(input, init) {
    const response = await originalFetch(input, init);
    const url = typeof input === 'string' ? input : String(input?.url || '');
    if (response?.ok && /\/reports\/export-excel\/company-data(?:\?|$)/.test(url)) {
      try {
        const clone = response.clone();
        const json = await clone.json();
        if (json?.success && json?.data?.processes) globalThis.companyData = json.data;
      } catch (_) {
        // Keep the original response untouched.
      }
    }
    return response;
  };
  globalThis.__KTC_COMPANY_DATA_SCOPE_FIX__ = true;
}

const GC_DEDUCTION_COLUMNS = Object.freeze({
  THIEU_SP: 11, BAT_MAY: 12, CHUYEN_MA: 13, CHINH_MAY: 14, CHO_CHINH_MAY: 15,
  MAT_DIEN: 16, MAT_KHI: 17, CHO_HANG: 18, BAO_DUONG: 19, NGHI_GIAI_LAO: 20,
  GIAO_CA: 21, HO_TRO: 22, GIAT_CAN_TUOT: 23, '5S': 24, HOC_VIEC: 25, DI_MUON_VE_SOM: 26
});
const GC_DEFECT_COLUMNS = Object.freeze({
  KQD: 36, VO_CAO_SU: 37, K_XUOC_CONG_GAY: 38, CAO_SU_XOAY: 39, CAT_KHONG_DUT: 40,
  BAVIA: 41, CSH: 42, PPCM: 43, KT_LON: 44, KT_NHO: 45, LCS: 46, CAT_LEM: 47,
  RACH_NVL: 48, CHAN_NGAN_DAI: 49, SOT_VIA: 50, FURE_TRUC: 51, LAN_CS: 52,
  BAVIA_CAT_HUT: 53, THIEU_CAO_SU: 54
});

function normCode(value) {
  return String(value ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd').replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '').toUpperCase();
}

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function text(value) {
  if (value && typeof value === 'object') {
    if (value.result !== undefined) return text(value.result);
    if (value.text !== undefined) return text(value.text);
  }
  return String(value ?? '').trim();
}

function originalPatch(report) {
  return {
    shift: text(report.shift),
    operation_type: text(report.operation_type),
    operation_mode: text(report.operation_mode),
    machine_no: text(report.machine_no || report.machine_code),
    product_name: text(report.product_name || report.product_code),
    training_percent: Number.isFinite(Number(report.training_percent)) ? Number(report.training_percent) : 100,
    actual_time: number(report.actual_time),
    tt_ok: Math.round(number(report.tt_ok ?? report.ok_quantity)),
    note: text(report.note),
    deductions: (report.deductions || []).map((item) => ({
      deduction_type_id: Number(item.deduction_type_id || item.id),
      hours: number(item.hours ?? item.value)
    })).filter((item) => item.deduction_type_id > 0),
    defects: (report.defects || []).map((item) => ({
      defect_type_id: Number(item.defect_type_id || item.id),
      quantity: Math.round(number(item.quantity ?? item.value))
    })).filter((item) => item.defect_type_id > 0)
  };
}

function addFastGcSyncMetadata(workbook, processData, yearMonth) {
  const old = workbook.getWorksheet('_KTC_SYNC');
  if (old) workbook.removeWorksheet(old.id);
  const sheet = workbook.addWorksheet('_KTC_SYNC');
  sheet.state = 'veryHidden';

  const columns = [
    { index: 2, key: 'workerCode', header: 'Mã NV' },
    { index: 3, key: 'workerName', header: 'Tên NV' },
    { index: 4, key: 'machine', header: 'Máy' },
    { index: 5, key: 'shift', header: 'Ca' },
    { index: 6, key: 'training', header: '% học việc' },
    { index: 8, key: 'actualTime', header: 'Thời gian thực tế' },
    { index: 27, key: 'product', header: 'Mã SP' },
    { index: 31, key: 'workDate', header: 'Ngày' },
    { index: 33, key: 'ok', header: 'OK' }
  ];

  for (const [code, index] of Object.entries(GC_DEDUCTION_COLUMNS)) {
    const item = (processData.deductionTypes || []).find((x) => normCode(x.code || x.deduction_code || x.name) === code);
    if (item?.id) columns.push({ index, key: `deduction:id:${Number(item.id)}`, header: code, typeId: Number(item.id) });
  }
  for (const [code, index] of Object.entries(GC_DEFECT_COLUMNS)) {
    const item = (processData.defectTypes || []).find((x) => normCode(x.code || x.defect_code || x.name) === code);
    if (item?.id) columns.push({ index, key: `defect:id:${Number(item.id)}`, header: code, typeId: Number(item.id) });
  }

  sheet.getCell('A1').value = JSON.stringify({
    version: EXCEL_SYNC_CONTRACT_VERSION,
    processCode: 'GC',
    sheetName: 'CẮT LỒNG',
    generatedAt: new Date().toISOString(),
    yearMonth,
    gcHelperSheet: null,
    columns
  });
  sheet.addRow(['report_id', 'expected_updated_at', 'operation_mode', 'original_json']);
  for (const report of processData.reports || []) {
    sheet.addRow([
      Number(report.id),
      report.updated_at || report.created_at || null,
      text(report.operation_mode).toUpperCase(),
      JSON.stringify(originalPatch(report))
    ]);
  }
}

async function buildFastGcProcess(args) {
  const processData = args?.payload?.processes?.GC || {};
  const yearMonth = String(args?.payload?.yearMonth || args?.date || '').slice(0, 7);

  // companyExcelLocal already uses the real bao-cao-cat-long-export.xlsx template
  // and writes only report values/formulas into its prepared rows. This avoids
  // renderProcessSheet() + per-cell styling + full-border pass for ~1,942 rows.
  const templatePayload = {
    groups: {
      GIA_CONG: {
        processes: [{
          process: { process_code: 'GC', process_name: 'CẮT/LỒNG' },
          reports: processData.reports || [],
          deductionTypes: processData.deductionTypes || [],
          defectTypes: processData.defectTypes || []
        }]
      }
    }
  };

  const result = await buildProcessExcelLocal({
    appPath: args.appPath,
    date: args.date,
    processCode: 'GC',
    payload: templatePayload
  });

  // Keep only the Cắt lồng sheet visible. Hidden lookup sheets from the template
  // are retained because formulas in the template can depend on them.
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(result.buffer);
  for (const sheet of [...workbook.worksheets]) {
    if (sheet.name !== 'Cắt lồng' && sheet.state === 'visible') workbook.removeWorksheet(sheet.id);
  }
  addFastGcSyncMetadata(workbook, processData, yearMonth);
  result.buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  result.fileName = `04_CAT_LONG_${yearMonth.slice(5, 7)}-${yearMonth.slice(0, 4)}.xlsx`;
  result.processCode = 'GC';
  result.processName = 'CẮT/LỒNG';
  result.reportCount = (processData.reports || []).length;
  result.templateKind = 'FAST_GC_TEMPLATE';
  return result;
}

function patchMonthly(mod) {
  if (!mod || mod.__ktcExcelExportPatched) return mod;
  const originalProcess = mod.buildProcessWorkbookLocal;
  if (typeof originalProcess !== 'function') return mod;

  const originalProcessForCode = async (args) => {
    const code = String(args?.processCode || '').trim().toUpperCase();
    if (code === 'GC') return buildFastGcProcess(args);
    return originalProcess(args);
  };

  mod.buildSplitMonthlyWorkbooksLocal = async (args = {}) => {
    const processes = [];
    for (const code of activeProcessCodes(args.payload)) {
      const item = await originalProcessForCode({ ...args, processCode: code });
      processes.push({ ...item, processCode: code, processName: item?.processName || code });
    }
    return { summary: null, processes };
  };

  mod.buildProcessWorkbookLocal = originalProcessForCode;
  Object.defineProperty(mod, '__ktcExcelExportPatched', { value: true });
  return mod;
}

Module._load = function patchedLoad(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  if (typeof request === 'string' && /monthlyWorkbookLocal\.cjs$/.test(request)) return patchMonthly(loaded);
  return loaded;
};
