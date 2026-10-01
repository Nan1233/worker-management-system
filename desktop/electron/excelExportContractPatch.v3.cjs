'use strict';

const Module = require('node:module');
const fs = require('node:fs/promises');
const path = require('node:path');
const ExcelJS = require('exceljs');
const JSZip = require('jszip');

const originalLoad = Module._load;
const TEMPLATE_NAME = 'bao-cao-cat-long-export.xlsx';
const SHEET_NAME = 'Cắt lồng';
const HEADER_ROW = 5;
const FIRST_ANCHOR_ROW = 6;
const DAY_BLOCK_SIZE = 191;
const DATA_CAPACITY = 188;

function now() { return Number(process.hrtime.bigint()) / 1e6; }
function text(v) { return v == null ? '' : String(v); }
function num(v) { const n = Number(text(v).replace(/,/g, '').trim()); return Number.isFinite(n) ? n : 0; }
function norm(v) {
  return text(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').toUpperCase();
}
function dateKey(v) {
  if (!v) return '';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  const d = new Date(v); if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function excelDate(v) { const k = dateKey(v); if (!k) return null; const [y,m,d] = k.split('-').map(Number); return new Date(y,m-1,d); }
function getMachine(report) {
  const direct = text(report.machine_no || report.machine_code).trim();
  const lines = Array.isArray(report.machine_lines) ? report.machine_lines : (Array.isArray(report.machines) ? report.machines : []);
  return [...new Set([direct, ...lines.map(x => text(x?.machine_no || x?.machine_code || x?.code).trim()).filter(Boolean)].filter(Boolean))].join(', ');
}
function sum(items, key) { return (items || []).reduce((a, x) => a + num(x?.[key]), 0); }
function metrics(r) {
  const ok = num(r.tt_ok ?? r.ok_quantity ?? r.ok);
  const ng = sum(r.defects, 'quantity');
  const actual = num(r.actual_time ?? r.working_time ?? r.work_time);
  const deduction = sum(r.deductions, 'hours');
  const total = num(r.total_time) || actual + deduction;
  const standard = num(r.standard_output ?? r.standard_output_per_hour ?? r.standard);
  const training = Math.min(100, Math.max(0, num(r.training_percent ?? 100)));
  const countedNg = (r.defects || []).reduce((a,x) => norm(x.defect_code || x.code || x.defect_name) === 'KQD' && Number(r.exclude_kqd_from_tt || 0) === 1 ? a : a + num(x.quantity), 0);
  const output = r.actual_output == null || text(r.actual_output).trim() === '' ? ok + countedNg : num(r.actual_output);
  const outputHour = actual > 0 ? output / actual : 0;
  const achievement = standard > 0 ? outputHour / standard : 0;
  return { ok, ng, actual, deduction, total, standard, training, output, outputHour, achievement, ngRate: ok + ng > 0 ? ng / (ok + ng) : 0 };
}
function valid(r) { return Boolean(r && text(r.worker_code).trim() && text(r.product_code || r.product_name).trim() && dateKey(r.work_date)); }
function sorted(reports) { return [...(reports || [])].filter(valid).sort((a,b) => dateKey(a.work_date).localeCompare(dateKey(b.work_date)) || text(a.entry_date || a.created_at || a.approved_at).localeCompare(text(b.entry_date || b.created_at || b.approved_at)) || text(a.worker_code).localeCompare(text(b.worker_code), undefined, {numeric:true}) || Number(a.id||0)-Number(b.id||0)); }
function log(event, data = {}) { try { const m = process.memoryUsage(); console.log('[KTC-EXCEL-TEMPLATE]', event, JSON.stringify({ elapsedMs: Math.round(now()), rssMB: Math.round(m.rss/1048576), heapMB: Math.round(m.heapUsed/1048576), ...data })); } catch (_) {} }

async function sanitizeTemplate(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const wb = zip.file('xl/workbook.xml');
  if (!wb || !(await wb.async('string')).includes('Cắt lồng')) return buffer;
  let removed = 0, relsChanged = 0, sheetsChanged = 0;
  for (const name of Object.keys(zip.files)) {
    if (/^xl\/comments\d+\.xml$/i.test(name) || /^xl\/drawings\/vmlDrawing\d+\.vml$/i.test(name)) { zip.remove(name); removed++; }
  }
  for (const name of Object.keys(zip.files)) {
    if (!/^xl\/worksheets\/_rels\/sheet\d+\.xml\.rels$/i.test(name)) continue;
    const f = zip.file(name); if (!f) continue; const xml = await f.async('string');
    const next = xml.replace(/<Relationship\b[^>]*\bType="[^"]*(?:comments|vmlDrawing)[^"]*"[^>]*\/?>/gi, '');
    if (next !== xml) { zip.file(name, next); relsChanged++; }
  }
  for (const name of Object.keys(zip.files)) {
    if (!/^xl\/worksheets\/sheet\d+\.xml$/i.test(name)) continue;
    const f = zip.file(name); if (!f) continue; const xml = await f.async('string');
    const next = xml.replace(/<legacyDrawing\b[^>]*\/?>/gi, '');
    if (next !== xml) { zip.file(name, next); sheetsChanged++; }
  }
  if (!removed && !relsChanged && !sheetsChanged) { log('TEMPLATE_SANITIZE_NOT_NEEDED'); return buffer; }
  const out = await zip.generateAsync({type:'nodebuffer', compression:'DEFLATE', compressionOptions:{level:6}});
  log('TEMPLATE_SANITIZED', {removedParts:removed, rewrittenRels:relsChanged, rewrittenSheets:sheetsChanged, bytesBefore:buffer.length, bytesAfter:out.length});
  return out;
}

function aliasesForHeader(header) {
  const h = norm(header);
  const groups = {
    STT:['STT'], THOIGIANNHAP:['THOI_GIAN_NHAP','THOI_GIAN_NHAP_LIEU'], MANV:['MA_NV','MA_NHAN_VIEN'], TENNV:['TEN_NV','TEN_NHAN_VIEN'], CA:['CA'], LOAITHAOTAC:['LOAI_THAO_TAC','LOAI_THAO_TAC'], CHEDO:['CHE_DO','CHẾ_ĐỘ'], MAY:['MAY','MA_MAY'], MASP:['MA_SP','MA_SAN_PHAM'], HOCPV:['HOCPV','HOC_VIEC','HOC_VIEC_PERCENT'], DINHMUC:['DINH_MUC'], TONGTHOIGIAN:['TONG_THOI_GIAN'], THOIGIANTHUCTE:['THOI_GIAN_THUC_TE'], TONGTHOIGIANTRU:['TONG_THOI_GIAN_TRU','TONG_THOI_GIAN_TRU_GIO'], THIEUSANLUONG:['THIEU_SAN_LUONG'], BATMAYXETMAY:['BAT_MAY_XET_MAY','BAT_MAY_XET_MAY_'], CHUYENMA:['CHUYEN_MA'], CHINHMAY:['CHINH_MAY'], CHOCHINHMAY:['CHO_CHINH_MAY'], MATDIEN:['MAT_DIEN'], MATKHI:['MAT_KHI'], CHOHANG:['CHO_HANG'], BAODUONGMAY:['BAO_DUONG_MAY'], NGHIGIAILAO:['NGHI_GIAI_LAO'], GIAOCA:['GIAO_CA'], HOTRO:['HO_TRO'], GITCAN_TUOT:['GIAT_CAN_TUOT'], FIVE_S:['5S'], HOCVIEC:['HOC_VIEC'], DIMUONVESOM:['DI_MUON_VE_SOM'], OUTPUT:['THUC_TE','SAN_LUONG_THUC_TE','SAN_LUONG'], OK:['DAT','OK'], NG:['NG'], TYLENG:['TY_LE_NG','NG_RATE'], NANGSUAT:['NANG_SUAT'], THANHTICH:['TY_LE_DAT','DAT_NANG_SUAT']
  };
  for (const [key, list] of Object.entries(groups)) if (list.includes(h)) return key;
  return null;
}
function buildHeaderMap(sheet) {
  const map = new Map();
  const row = sheet.getRow(HEADER_ROW);
  for (let c=1;c<=sheet.columnCount;c++) {
    const h = norm(row.getCell(c).value);
    if (h) map.set(c, aliasesForHeader(h) || h);
  }
  return map;
}
function detailValue(report, header, type) {
  const items = type === 'deduction' ? (report.deductions || []) : (report.defects || []);
  const target = norm(header);
  let total = 0;
  for (const item of items) {
    const code = norm(item.deduction_code || item.defect_code || item.code || item.deduction_name || item.defect_name);
    const name = norm(item.deduction_name || item.defect_name || item.code || item.deduction_code || item.defect_code);
    if (code === target || name === target) total += num(type === 'deduction' ? item.hours : item.quantity);
  }
  return total;
}
function writeReport(row, report, sequence, headerMap) {
  const m = metrics(report);
  for (const [column, key] of headerMap) {
    const cell = row.getCell(column);
    switch (key) {
      case 'STT': cell.value = sequence; break;
      case 'THOIGIANNHAP': cell.value = excelDate(report.entry_date || report.created_at || report.approved_at || report.work_date); cell.numFmt = 'dd/mm/yyyy hh:mm'; break;
      case 'MANV': cell.value = text(report.worker_code); break;
      case 'TENNV': cell.value = text(report.full_name || report.worker_name || report.worker_full_name || report.user_full_name); break;
      case 'CA': cell.value = text(report.shift).toUpperCase(); break;
      case 'LOAITHAOTAC': cell.value = text(report.operation_type || report.work_type || report.operation || 'CẮT'); break;
      case 'CHEDO': cell.value = text(report.mode || report.work_mode || report.production_mode || 'TAY').toUpperCase(); break;
      case 'MAY': cell.value = getMachine(report); break;
      case 'MASP': cell.value = text(report.product_code || report.product_name); break;
      case 'HOCPV': cell.value = m.training / 100; cell.numFmt = '0%'; break;
      case 'DINHMUC': cell.value = m.standard; cell.numFmt = '#,##0.00'; break;
      case 'TONGTHOIGIAN': cell.value = m.total; cell.numFmt = '0.00'; break;
      case 'THOIGIANTHUCTE': cell.value = m.actual; cell.numFmt = '0.00'; break;
      case 'TONGTHOIGIANTRU': cell.value = m.deduction; cell.numFmt = '0.00'; break;
      case 'THIEUSANLUONG': cell.value = detailValue(report, 'Thiếu sản lượng', 'deduction'); break;
      case 'BATMAYXETMAY': cell.value = detailValue(report, 'Bật máy, xét máy', 'deduction'); break;
      case 'CHUYENMA': cell.value = detailValue(report, 'Chuyển mã', 'deduction'); break;
      case 'CHINHMAY': cell.value = detailValue(report, 'Chỉnh máy', 'deduction'); break;
      case 'CHOCHINHMAY': cell.value = detailValue(report, 'Chờ chỉnh máy', 'deduction'); break;
      case 'MATDIEN': cell.value = detailValue(report, 'Mất điện', 'deduction'); break;
      case 'MATKHI': cell.value = detailValue(report, 'Mất khí', 'deduction'); break;
      case 'CHOHANG': cell.value = detailValue(report, 'Chờ hàng', 'deduction'); break;
      case 'BAODUONGMAY': cell.value = detailValue(report, 'Bảo dưỡng máy', 'deduction'); break;
      case 'NGHIGIAILAO': cell.value = detailValue(report, 'Nghỉ giải lao', 'deduction'); break;
      case 'GIAOCA': cell.value = detailValue(report, 'Giao ca', 'deduction'); break;
      case 'HOTRO': cell.value = detailValue(report, 'Hỗ trợ', 'deduction'); break;
      case 'GITCAN_TUOT': cell.value = detailValue(report, 'Giặt cs/cân cs, tuốt-tái pp, GL', 'deduction'); break;
      case 'FIVE_S': cell.value = detailValue(report, '5S', 'deduction'); break;
      case 'HOCVIEC': cell.value = detailValue(report, 'Học việc, đào tạo', 'deduction'); break;
      case 'DIMUONVESOM': cell.value = detailValue(report, 'Đi muộn về sớm', 'deduction'); break;
      case 'OUTPUT': cell.value = m.output; break;
      case 'OK': cell.value = m.ok; break;
      case 'NG': cell.value = m.ng; break;
      case 'TYLENG': cell.value = m.ngRate; cell.numFmt = '0.00%'; break;
      case 'NANGSUAT': cell.value = m.outputHour; break;
      case 'THANHTICH': cell.value = m.achievement; cell.numFmt = '0.00%'; break;
      default:
        if (column > 14) cell.value = detailValue(report, row.getCell(column).value, 'defect');
        break;
    }
  }
}

async function buildGcFromTemplate(args) {
  const started = now();
  const reports = sorted(args?.payload?.processes?.GC?.reports || []);
  const templatePath = path.join(args.appPath, 'assets', 'templates', TEMPLATE_NAME);
  log('BUILD_START', {date:args.date, reportCount:reports.length, templatePath});
  const raw = await fs.readFile(templatePath);
  log('TEMPLATE_READ_DONE', {ms:Math.round(now()-started), bytes:raw.length});
  const safe = await sanitizeTemplate(raw);
  const workbook = new ExcelJS.Workbook();
  const loadStart = now();
  await workbook.xlsx.load(safe);
  log('TEMPLATE_LOAD_DONE', {ms:Math.round(now()-loadStart), totalMs:Math.round(now()-started), sheetCount:workbook.worksheets.length, sheets:workbook.worksheets.map(s=>({name:s.name,rows:s.rowCount,cols:s.columnCount}))});
  const target = workbook.getWorksheet(SHEET_NAME) || workbook.worksheets[0];
  if (!target) throw new Error('Template không có sheet Cắt lồng.');
  for (const sheet of [...workbook.worksheets]) if (sheet.id !== target.id) workbook.removeWorksheet(sheet.id);

  const headerMap = buildHeaderMap(target);
  log('TEMPLATE_HEADER_MAP', {columns:[...headerMap.entries()]});
  const byDay = new Map();
  for (const r of reports) { const d=Number(dateKey(r.work_date).slice(8,10)); if(!byDay.has(d))byDay.set(d,[]); byDay.get(d).push(r); }
  const injectStart = now();
  for (let day=1; day<=31; day++) {
    const anchor = FIRST_ANCHOR_ROW + (day-1)*DAY_BLOCK_SIZE;
    const start = anchor;
    const end = start + DATA_CAPACITY - 1;
    const dayReports = byDay.get(day) || [];
    if (dayReports.length > DATA_CAPACITY) throw new Error(`Ngày ${day} có ${dayReports.length} báo cáo, vượt sức chứa ${DATA_CAPACITY} dòng của template Cắt lồng.`);
    const anchorRow = target.getRow(anchor);
    if (dayReports.length) { anchorRow.getCell(1).value = excelDate(`${String(args.date).slice(0,7)}-${String(day).padStart(2,'0')}`); anchorRow.getCell(1).numFmt='dd/mm/yyyy'; }
    for (let rn=start; rn<=end; rn++) {
      const row=target.getRow(rn);
      for(let c=1;c<=target.columnCount;c++) { if(c!==1) row.getCell(c).value=null; }
      row.hidden = rn >= start + dayReports.length;
    }
    dayReports.forEach((r,i)=>writeReport(target.getRow(start+i),r,i+1,headerMap));
  }
  log('DATA_INJECT_DONE',{ms:Math.round(now()-injectStart),reportCount:reports.length});
  workbook.calcProperties.fullCalcOnLoad=false;
  workbook.calcProperties.forceFullCalc=false;
  workbook.calcProperties.calcMode='auto';
  const writeStart=now();
  const buffer=Buffer.from(await workbook.xlsx.writeBuffer());
  log('WRITE_BUFFER_DONE',{ms:Math.round(now()-writeStart),totalMs:Math.round(now()-started),bytes:buffer.length});
  return {buffer,result:{code:'GC',sheet:target.name,reportCount:reports.length},processCode:'GC',processName:'CẮT/LỒNG',fileName:`04_CAT_LONG_${String(args.date).slice(5,7)}-${String(args.date).slice(0,4)}.xlsx`,reportCount:reports.length,formulaReplacementCount:0,templateKind:'ONE_SHEET_TEMPLATE_INJECT'};
}

function patchMonthly(mod) {
  if (!mod || mod.__ktcV3MonthlyPatched) return mod;
  const originalProcess=mod.buildProcessWorkbookLocal;
  if(typeof originalProcess!=='function'){log('PATCH_FAILED',{reason:'buildProcessWorkbookLocal_missing'});return mod;}
  mod.buildProcessWorkbookLocal=async(args={})=>String(args.processCode||'').trim().toUpperCase()==='GC'?buildGcFromTemplate(args):originalProcess(args);
  mod.buildSplitMonthlyWorkbooksLocal=async(args={})=>{
    const processes=[];
    for(const [code,data] of Object.entries(args?.payload?.processes||{})) if(Array.isArray(data?.reports)&&data.reports.length) processes.push(await mod.buildProcessWorkbookLocal({...args,processCode:code}));
    return {summary:null,processes};
  };
  Object.defineProperty(mod,'__ktcV3MonthlyPatched',{value:true});
  log('MONTHLY_PATCH_INSTALLED_V3');
  return mod;
}

Module._load=function ktcTemplatePatch(request,parent,isMain){const loaded=originalLoad.call(this,request,parent,isMain);if(typeof request==='string'&&/monthlyWorkbookLocal\.cjs$/.test(request))return patchMonthly(loaded);return loaded;};
log('EXCEL_EXPORT_V3_READY');
