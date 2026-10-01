'use strict';

const Module = require('node:module');
const ExcelJS = require('exceljs');
const { dialog } = require('electron');

const originalLoad = Module._load;
const originalFetch = globalThis.fetch;
const companyDataCache = new Map();
const processListCache = new Map();
let patchedModule = null;

function norm(value) {
  return String(value ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .trim().toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}
function text(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && value.result !== undefined) return text(value.result);
  return String(value).trim();
}
function num(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value); return Number.isFinite(n) ? n : null;
}
function dateValue(value) {
  if (!value) return value;
  if (value instanceof Date) return value;
  const s = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return value;
  const [y,m,d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function authFrom(init) {
  const headers = init?.headers || {};
  if (typeof headers.get === 'function') return headers.get('authorization') || '';
  return headers.authorization || headers.Authorization || '';
}
function machineValue(r) {
  const lines = Array.isArray(r?.machineLines) ? r.machineLines : [];
  const values = lines.map(x => text(x?.machine_code ?? x?.machine_no ?? x?.machine_name)).filter(Boolean);
  return values.length ? [...new Set(values)].join(', ') : text(r?.machine_no ?? r?.machine_code ?? r?.machine);
}
function productValue(r) {
  const lines = Array.isArray(r?.machineLines) ? r.machineLines : [];
  const values = lines.map(x => text(x?.product_code ?? x?.product_name)).filter(Boolean);
  return values.length ? [...new Set(values)].join(', ') : text(r?.product_code ?? r?.product_name ?? r?.product);
}
function detailItems(r, kind) {
  return Array.isArray(r?.[kind === 'deduction' ? 'deductions' : 'defects']) ? r[kind === 'deduction' ? 'deductions' : 'defects'] : [];
}
function detailMap(r, kind) {
  const map = new Map();
  for (const item of detailItems(r, kind)) {
    const id = num(item?.[kind === 'deduction' ? 'deduction_type_id' : 'defect_type_id']);
    const code = text(item?.[kind === 'deduction' ? 'deduction_type_code' : 'defect_type_code'] ?? item?.[kind === 'deduction' ? 'code' : 'code']);
    const name = text(item?.[kind === 'deduction' ? 'deduction_type_name' : 'defect_type_name'] ?? item?.[kind === 'deduction' ? 'name' : 'name']);
    const value = num(item?.[kind === 'deduction' ? 'hours' : 'quantity']) ?? 0;
    for (const key of [id > 0 ? `ID:${id}` : '', norm(code), norm(name)].filter(Boolean)) map.set(key, (map.get(key) || 0) + value);
  }
  return map;
}
function typeMap(processData, kind) {
  const list = Array.isArray(processData?.[kind === 'deduction' ? 'deductionTypes' : 'defectTypes']) ? processData[kind === 'deduction' ? 'deductionTypes' : 'defectTypes'] : [];
  const map = new Map();
  for (const t of list) {
    const id = num(t?.id);
    const code = text(t?.[kind === 'deduction' ? 'deduction_code' : 'defect_code'] ?? t?.code);
    const name = text(t?.[kind === 'deduction' ? 'deduction_name' : 'defect_name'] ?? t?.name ?? t?.label);
    if (id) {
      map.set(norm(code), `ID:${id}`);
      map.set(norm(name), `ID:${id}`);
    }
  }
  return map;
}
function headers(sheet) {
  const map = new Map();
  for (let c = 1; c <= sheet.columnCount; c++) {
    const h = norm(sheet.getCell(5, c).value);
    if (h) map.set(h, c);
  }
  return map;
}
function setCol(sheet, hs, names, value, fmt) {
  for (const name of names) {
    const c = hs.get(norm(name));
    if (!c) continue;
    sheet.getCell(this.row, c).value = value;
    if (fmt) sheet.getCell(this.row, c).numFmt = fmt;
  }
}
function patchSheet(sheet, reports, processData) {
  if (sheet.state !== 'visible' || sheet.name.startsWith('_')) return;
  const hs = headers(sheet);
  if (!hs.size) return;
  const idCol = hs.get('ID') || hs.get('MA BAO CAO') || hs.get('REPORT ID');
  const byId = new Map(reports.map(r => [Number(r?.id), r]));
  const rows = [];
  if (idCol) for (let row = 6; row <= sheet.rowCount; row++) {
    const id = Number(sheet.getCell(row, idCol).value);
    if (id > 0 && byId.has(id)) rows.push([row, byId.get(id)]);
  }
  if (!rows.length) return;

  const dTypes = typeMap(processData, 'deduction');
  const fTypes = typeMap(processData, 'defect');
  for (const [row, r] of rows) {
    const put = (names, value, fmt) => setCol.call({row}, sheet, hs, names, value, fmt);
    put(['ID'], num(r.id));
    put(['Ngày','Ngày làm việc'], dateValue(r.work_date), 'dd/mm/yyyy');
    put(['Mã NV','Mã công nhân'], text(r.worker_code));
    put(['Tên NV','Tên công nhân','Họ tên'], text(r.full_name ?? r.worker_name ?? r.worker_full_name));
    put(['Ca'], text(r.shift));
    put(['Loại thao tác'], text(r.operation_type));
    put(['Chế độ'], text(r.operation_mode));
    put(['Máy','Mã máy'], machineValue(r));
    put(['Mã SP','Mã sản phẩm','Sản phẩm'], productValue(r));
    put(['% học việc','% Học việc'], num(r.training_percent));
    put(['Định mức','Định mức/H'], num(r.standard_output ?? r.standard_output_per_hour));
    put(['Tổng thời gian'], num(r.total_time));
    put(['Thời gian chạy thực tế','Thời gian thực tế'], num(r.actual_time));
    put(['Tổng thời gian trừ','Thời gian trừ'], num(r.deduction_time));
    put(['OK','SL OK','Sản lượng OK'], num(r.tt_ok ?? r.ok_quantity));
    put(['NG','SL NG','Tổng NG'], num(r.tt_ng ?? r.total_ng ?? r.ng_quantity));
    put(['SP công nhân nhập','Sản lượng thực tế','Sản lượng','Output'], num(r.actual_output));
    put(['Trạng thái'], text(r.status));
    put(['Ghi chú'], text(r.note ?? r.notes));

    const dm = detailMap(r, 'deduction');
    const fm = detailMap(r, 'defect');
    for (const [h,c] of hs) {
      const dk = dTypes.get(h); if (dk) sheet.getCell(row,c).value = dm.get(dk) ?? 0;
      const fk = fTypes.get(h); if (fk) sheet.getCell(row,c).value = fm.get(fk) ?? 0;
    }
  }
}
async function patchBuffer(buffer, payload, code) {
  if (!buffer || !payload || payload.dataSource !== 'tidb.production_reports.approved') return buffer;
  const pd = payload.processes?.[code];
  if (!pd || !Array.isArray(pd.reports)) return buffer;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  for (const sheet of wb.worksheets) patchSheet(sheet, pd.reports, pd);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
function errorText(e) { return e?.stack || e?.message || String(e); }
async function showError(e) {
  console.error('[KTC][EXCEL_BUILD_ERROR]', errorText(e));
  try { await dialog.showMessageBox({type:'error', title:'Lỗi cập nhật Excel', message:'Không thể cập nhật Excel tháng.', detail:errorText(e).slice(0,5000), buttons:['OK']}); } catch {}
}
function makeResponse(buffer, fileName) {
  return new Response(buffer, {status:200, headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,'Cache-Control':'private, no-store','X-KTC-Excel-Backend':'desktop-local-db-truth'}});
}
async function fetchCompanyDataLocal(apiUrl, auth, date) {
  const key = `${apiUrl}|${date}`;
  if (companyDataCache.has(key)) return companyDataCache.get(key);
  const p = (async () => {
    const r = await originalFetch(`${apiUrl}/reports/export-excel/company-data?date=${encodeURIComponent(date)}`, {headers:{Authorization:auth,Accept:'application/json'}});
    if (!r.ok) throw new Error(`company-data HTTP ${r.status}`);
    const j = await r.json();
    if (!j?.success || !j?.data?.processes) throw new Error('Backend không trả payload company-data hợp lệ.');
    return j.data;
  })();
  companyDataCache.set(key,p);
  try { return await p; } catch(e) { companyDataCache.delete(key); throw e; }
}
async function fetchProcessListLocal(apiUrl, auth, date) {
  const key = `${apiUrl}|${date}`;
  if (processListCache.has(key)) return processListCache.get(key);
  const p = (async () => {
    const r = await originalFetch(`${apiUrl}/reports/export-excel/processes?date=${encodeURIComponent(date)}`, {headers:{Authorization:auth,Accept:'application/json'}});
    if (!r.ok) throw new Error(`processes HTTP ${r.status}`);
    const j = await r.json(); return Array.isArray(j?.data) ? j.data : [];
  })();
  processListCache.set(key,p);
  try { return await p; } catch(e) { processListCache.delete(key); throw e; }
}
async function buildLocalExcelResponse(url, init={}) {
  const u = new URL(url);
  const apiUrl = u.origin + u.pathname.replace(/\/reports\/export-excel(?:\/process)?$/, '');
  const body = typeof init.body === 'string' ? JSON.parse(init.body || '{}') : (init.body || {});
  const date = String(body.date || '').trim();
  if (!date) throw new Error('Thiếu ngày xuất Excel.');
  const auth = authFrom(init); if (!auth) throw new Error('Thiếu token đăng nhập khi xuất Excel.');
  const payload = await fetchCompanyDataLocal(apiUrl, auth, date);
  const monthly = require('./monthlyWorkbookLocal.cjs');
  if (u.pathname.endsWith('/reports/export-excel')) {
    const built = await monthly.buildMonthlySummaryWorkbookLocal({date,payload});
    return makeResponse(built.buffer, built.fileName || `00_TONG_HOP_SAN_XUAT_${date.slice(5,7)}-${date.slice(0,4)}.xlsx`);
  }
  const processId = Number(body.processId); if (!Number.isInteger(processId) || processId <= 0) throw new Error('Thiếu processId hợp lệ.');
  const list = await fetchProcessListLocal(apiUrl, auth, date);
  const info = list.find(x => Number(x?.id ?? x?.processId ?? x?.process_id) === processId);
  if (!info) throw new Error(`Không tìm thấy công đoạn processId=${processId}.`);
  const code = String(info.processCode ?? info.process_code ?? info.code ?? '').trim();
  const built = await monthly.buildProcessWorkbookLocal({date,payload,processCode:code});
  return makeResponse(built.buffer, built.fileName || `Bao-cao-${code}-${date.slice(5,7)}-${date.slice(0,4)}.xlsx`);
}
function installFetch() {
  if (globalThis.__KTC_LOCAL_EXCEL_FETCH_INSTALLED__) return;
  globalThis.fetch = async function ktcLocalExcelFetch(input, init={}) {
    const url = typeof input === 'string' ? input : input?.url || '';
    const method = String(init?.method || (typeof input !== 'string' ? input?.method : 'GET') || 'GET').toUpperCase();
    if (method === 'POST' && /\/reports\/export-excel(?:\/process)?(?:\?|$)/.test(String(url))) {
      try { return await buildLocalExcelResponse(String(url), init); }
      catch (e) { console.error('[KTC] DESKTOP_LOCAL_EXCEL_EXPORT_FAILED', e); throw e; }
    }
    return originalFetch(input, init);
  };
  globalThis.__KTC_LOCAL_EXCEL_FETCH_INSTALLED__ = true;
}
function activeProcessCodes(payload) {
  const processes = payload?.processes || {};
  return Object.entries(processes)
    .filter(([, data]) => Array.isArray(data?.reports) && data.reports.length > 0)
    .map(([code]) => code);
}
async function makeNoopSummary(date, payload, processes) {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet('THÁNG');
  const [year, month] = String(payload?.yearMonth || date).slice(0, 7).split('-');
  return {
    buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
    fileName: processes[0]?.fileName || `00_TONG_HOP_SAN_XUAT_${month}-${year}.xlsx`,
    formulaReplacementCount: 0
  };
}
function patchMonthly(mod) {
  if (!mod || mod.__ktcExcelExportPatched) return mod;
  const originalSplit = mod.buildSplitMonthlyWorkbooksLocal;
  const process = mod.buildProcessWorkbookLocal;
  if (typeof originalSplit === 'function' && typeof process === 'function') {
    mod.buildSplitMonthlyWorkbooksLocal = async (args={}) => {
      try {
        const codes = activeProcessCodes(args.payload);
        const processes = [];
        for (const code of codes) {
          const result = await process({ ...args, processCode: code });
          if (result?.buffer) result.buffer = await patchBuffer(result.buffer, args.payload, code);
          processes.push({
            ...result,
            processCode: code,
            processName: result?.processName || code
          });
        }
        const summary = await makeNoopSummary(args.date, args.payload, processes);
        return { summary, processes };
      } catch(e) { await showError(e); throw e; }
    };
  }
  if (typeof process === 'function') mod.buildProcessWorkbookLocal = async (args={}) => {
    try {
      const result = await process(args);
      if (result?.buffer) result.buffer = await patchBuffer(result.buffer, args.payload, args.processCode);
      return result;
    } catch(e) { await showError(e); throw e; }
  };
  Object.defineProperty(mod,'__ktcExcelExportPatched',{value:true});
  return mod;
}
installFetch();
Module._load = function patchedLoad(request,parent,isMain) {
  const loaded = originalLoad.call(this,request,parent,isMain);
  if (typeof request === 'string' && /monthlyWorkbookLocal\.cjs$/.test(request)) {
    patchedModule = patchMonthly(loaded); return patchedModule;
  }
  return loaded;
};
