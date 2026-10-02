'use strict';

const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const ExcelJS = require('exceljs');
const monthly = require('./monthlyWorkbookLocal.cjs');

const GC = Object.freeze({
  DEDUCTION_FIRST: 11,
  DEDUCTION_LAST: 26,
  DEDUCTION_TOTAL: 10,
  NG: 34,
  DEFECT_FIRST: 36,
  DEFECT_LAST: 54
});

const norm = (value) => String(value ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd')
  .replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').toUpperCase();

const num = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const n = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
};

function parseExtraData(report) {
  const raw = report?.extra_data;
  if (!raw) return {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_) { return {}; }
}

function extraValue(report, aliases) {
  const columns = parseExtraData(report)?.columns;
  if (!columns || typeof columns !== 'object' || Array.isArray(columns)) return 0;
  const wanted = new Set((aliases || []).map(norm));
  return Object.entries(columns).reduce((sum, [key, value]) => wanted.has(norm(key)) ? sum + num(value) : sum, 0);
}

function detailValue(item, kind) {
  const value = kind === 'deduction'
    ? (item?.hours ?? item?.deduction_hours ?? item?.duration_hours ?? item?.time_hours ?? item?.value)
    : (item?.quantity ?? item?.defect_quantity ?? item?.ng_quantity ?? item?.qty ?? item?.count ?? item?.value);
  return num(value);
}

function detailArray(report, kind) {
  const names = kind === 'deduction'
    ? ['deductions', 'deductionDetails', 'deduction_details', 'deductionRows', 'deduction_rows']
    : ['defects', 'defectDetails', 'defect_details', 'defectRows', 'defect_rows'];
  for (const name of names) if (Array.isArray(report?.[name])) return report[name];
  return [];
}

function typeKeys(type, kind) {
  if (!type) return [];
  return (kind === 'deduction'
    ? [type.id, type.code, type.deduction_code, type.name, type.deduction_name]
    : [type.id, type.code, type.defect_code, type.name, type.defect_name])
    .filter((v) => v !== null && v !== undefined && String(v) !== '').map(norm);
}

function itemKeys(item, kind) {
  return (kind === 'deduction'
    ? [item?.deduction_type_id, item?.deduction_type_code, item?.deduction_code, item?.deduction_type_name, item?.deduction_name, item?.type_code, item?.type_name, item?.code, item?.name]
    : [item?.defect_type_id, item?.defect_type_code, item?.defect_code, item?.defect_type_name, item?.defect_name, item?.type_code, item?.type_name, item?.code, item?.name])
    .filter((v) => v !== null && v !== undefined && String(v) !== '').map(norm);
}

function findChildValue(report, processData, header, kind) {
  const target = norm(header);
  const types = kind === 'deduction' ? processData?.deductionTypes : processData?.defectTypes;
  let total = 0;
  let matched = false;
  for (const item of detailArray(report, kind)) {
    const id = kind === 'deduction' ? item?.deduction_type_id : item?.defect_type_id;
    const type = Array.isArray(types) ? types.find((x) => String(x?.id ?? '') === String(id ?? '')) : null;
    if ([...itemKeys(item, kind), ...typeKeys(type, kind)].includes(target)) {
      total += detailValue(item, kind);
      matched = true;
    }
  }
  return { value: total, matched };
}

const DEDUCTION_ALIASES = new Map([
  [norm('Thiếu sản lượng'), ['Thiếu sản lượng']],
  [norm('Bật máy, xét máy'), ['Bật máy, xét máy', 'Bật máy', 'Xét máy']],
  [norm('Chuyển mã'), ['Chuyển mã']], [norm('Chỉnh máy'), ['Chỉnh máy']], [norm('Chờ chỉnh máy'), ['Chờ chỉnh máy']],
  [norm('Mất điện'), ['Mất điện']], [norm('Mất khí'), ['Mất khí']], [norm('Chờ hàng'), ['Chờ hàng']],
  [norm('Bảo dưỡng máy'), ['Bảo dưỡng máy']], [norm('Nghỉ giải lao'), ['Nghỉ giải lao']], [norm('Giao ca'), ['Giao ca']],
  [norm('Dừng máy đi hỗ trợ'), ['Dừng máy đi hỗ trợ']], [norm('Giặt cs/cân cs, tuốt-tái pp, GL'), ['Giặt cs/cân cs, tuốt-tái pp, GL']],
  [norm('5S'), ['5S', '5s']], [norm('Học việc, đào tạo'), ['Học việc, đào tạo']],
  [norm('Đi muộn về sớm'), ['Đi muộn về sớm', 'Đi muộn, về sớm']]
]);

const LEGACY_DEFECT_FIELDS = Object.freeze({
  KQD: ['kqd_dap_lai', 'kqd_tuot'], VO_CAO_SU: ['vo_do_long'], K_XUOC_CONG_GAY: ['xuoc_do_long', 'cong_gay'],
  CAO_SU_XOAY: ['xoay'], XOAY: ['xoay'], CAT_KHONG_DUT: ['khong_dut'], BAVIA: ['bavia_hut'], PPCM: ['ppcm'],
  LCS: ['loi_cao_su'], LOI_CAO_SU: ['loi_cao_su'], KT_LON: ['ng_kich_thuoc'], KT_KICH_THUOC: ['ng_kich_thuoc'], CAT_LEM: ['cat_lem']
});

const DEFECT_ALIASES = new Map([
  [norm('KQD'), ['KQD']], [norm('Vỡ cao su'), ['Vỡ cao su', 'VO_CAO_SU']], [norm('K xước cong gãy'), ['K xước cong gãy', 'K_XUOC_CONG_GAY']],
  [norm('Cao su xoay'), ['Cao su xoay', 'XOAY']], [norm('Cắt không đứt'), ['Cắt không đứt', 'CAT_KHONG_DUT']], [norm('Bavia'), ['Bavia', 'BAVIA']],
  [norm('CSH'), ['CSH']], [norm('PPCM'), ['PPCM']], [norm('KT lớn'), ['KT lớn', 'KT kích thước', 'KT_LON']], [norm('KT nhỏ'), ['KT nhỏ', 'KT_NHO']],
  [norm('LCS'), ['LCS', 'Lỗi cao su']], [norm('Cắt lẹm'), ['Cắt lẹm', 'CAT_LEM']], [norm('Rách NVL'), ['Rách NVL', 'RACH_NVL']],
  [norm('Chân ngắn dài'), ['Chân ngắn dài', 'CHAN_NGAN_DAI']], [norm('Sót via'), ['Sót via', 'SOT_VIA']], [norm('Fure trục'), ['Fure trục', 'FURE_TRUC']],
  [norm('Lẫn CS'), ['Lẫn CS', 'Lẫn cs', 'LAN_CS']], [norm('Bavia cắt hụt'), ['Bavia cắt hụt', 'BAVIA_CAT_HUT']], [norm('Thiếu cao su'), ['Thiếu cao su', 'THIEU_CAO_SU']]
]);

function legacyDefectValue(report, header) {
  const h = norm(header);
  const fields = LEGACY_DEFECT_FIELDS[h];
  if (fields) {
    const value = fields.reduce((sum, field) => sum + num(report?.[field]), 0);
    if (value !== 0) return value;
  }
  return extraValue(report, DEFECT_ALIASES.get(h) || [header]);
}

function deductionValue(report, processData, header) {
  const child = findChildValue(report, processData, header, 'deduction');
  if (child.matched) return { value: child.value, source: 'production_report_deductions' };
  const value = extraValue(report, DEDUCTION_ALIASES.get(norm(header)) || [header]);
  return { value, source: value !== 0 ? 'production_reports.extra_data.columns' : 'none' };
}

function defectValue(report, processData, header) {
  const child = findChildValue(report, processData, header, 'defect');
  if (child.matched && child.value !== 0) return { value: child.value, source: 'production_report_defects' };
  const legacy = legacyDefectValue(report, header);
  if (legacy !== 0) return { value: legacy, source: 'production_reports.legacy_fields' };
  if (child.matched) return { value: child.value, source: 'production_report_defects_zero' };
  return { value: 0, source: 'none' };
}

// A report row is identified by STT only. Worker code may be blank on legacy
// records; excluding such rows caused the previous 1909-vs-1942 failure.
function reportRows(sheet) {
  return [...(sheet._rows || [])]
    .filter((row) => {
      const stt = row?.getCell(1)?.value;
      return typeof stt === 'number' && Number.isFinite(stt) && stt > 0;
    })
    .sort((a, b) => a.number - b.number);
}

function reportsFromPayload(payload) {
  const list = Array.isArray(payload?.processes?.GC?.reports) ? [...payload.processes.GC.reports] : [];
  return list.sort((a, b) => String(a?.work_date || '').localeCompare(String(b?.work_date || ''))
    || String(a?.approved_at || a?.created_at || '').localeCompare(String(b?.approved_at || b?.created_at || ''))
    || Number(a?.id || 0) - Number(b?.id || 0));
}

function copyCellStyle(source, target) {
  if (!source || !target) return;
  if (source.font) target.font = { ...source.font, color: source.font.color ? { ...source.font.color } : undefined };
  if (source.fill) target.fill = JSON.parse(JSON.stringify(source.fill));
  if (source.border) target.border = JSON.parse(JSON.stringify(source.border));
  if (source.alignment) target.alignment = { ...source.alignment };
  if (source.protection) target.protection = { ...source.protection };
  if (source.numFmt) target.numFmt = source.numFmt;
}

function ensureRows(sheet, reports, rows) {
  if (rows.length >= reports.length) return rows.slice(0, reports.length);
  const totalRow = [...(sheet._rows || [])].find((row) => {
    const text = norm(row?.getCell(1)?.value);
    return text.includes('TONG') && text.includes('CONG');
  });
  const source = rows[rows.length - 1];
  if (!source) throw new Error('GC template không có dòng report mẫu để chèn thêm.');
  const start = totalRow?.number || (source.number + 1);
  const missing = reports.length - rows.length;
  for (let i = 0; i < missing; i += 1) {
    const targetNumber = start + i;
    sheet.insertRow(targetNumber, []);
    const target = sheet.getRow(targetNumber);
    target.height = source.height;
    for (let c = 1; c <= Math.max(sheet.columnCount, GC.DEFECT_LAST); c += 1) copyCellStyle(source.getCell(c), target.getCell(c));
    target.getCell(1).value = rows.length + i + 1;
    target.getCell(2).value = reports[rows.length + i]?.worker_code ?? '';
    target.getCell(3).value = reports[rows.length + i]?.full_name ?? reports[rows.length + i]?.worker_name ?? '';
    target.getCell(4).value = reports[rows.length + i]?.machine_no ?? '';
    target.getCell(5).value = reports[rows.length + i]?.shift ?? '';
  }
  return reportRows(sheet).slice(0, reports.length);
}

async function patchGcBuffer(buffer, payload) {
  if (!Buffer.isBuffer(buffer)) return buffer;
  if (payload?.dataSource !== 'tidb.production_reports.approved') return buffer;
  const processData = payload?.processes?.GC || {};
  const reports = reportsFromPayload(payload);
  if (!reports.length) return buffer;

  const tmp = path.join(os.tmpdir(), `ktc-gc-fallback-${process.pid}-${Date.now()}.xlsx`);
  fs.writeFileSync(tmp, buffer);
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(tmp);
    const sheet = wb.getWorksheet('Cắt lồng') || wb.getWorksheet('CẮT LỒNG') || wb.worksheets[0];
    if (!sheet) return buffer;

    const rows = ensureRows(sheet, reports, reportRows(sheet));
    let totalDeduction = 0;
    let totalNg = 0;
    let detailDeduction = 0;
    let detailNg = 0;
    let rawDeductionItems = 0;
    let rawDefectItems = 0;
    let matchedDeductionItems = 0;
    let matchedDefectItems = 0;
    let legacyDefectFallbackRows = 0;

    const typesD = Array.isArray(processData.deductionTypes) ? processData.deductionTypes : [];
    const typesF = Array.isArray(processData.defectTypes) ? processData.defectTypes : [];

    for (let i = 0; i < reports.length; i += 1) {
      const report = reports[i];
      const row = rows[i];
      const deductions = detailArray(report, 'deduction');
      const defects = detailArray(report, 'defect');
      rawDeductionItems += deductions.length;
      rawDefectItems += defects.length;

      for (let c = GC.DEDUCTION_FIRST; c <= GC.DEDUCTION_LAST; c += 1) row.getCell(c).value = 0;
      for (let c = GC.DEFECT_FIRST; c <= GC.DEFECT_LAST; c += 1) row.getCell(c).value = 0;

      for (let c = GC.DEDUCTION_FIRST; c <= GC.DEDUCTION_LAST; c += 1) {
        const type = typesD[c - GC.DEDUCTION_FIRST];
        const header = type?.name || type?.deduction_name || type?.code || type?.deduction_code || '';
        if (!header) continue;
        const resolved = deductionValue(report, processData, header);
        row.getCell(c).value = num(resolved.value);
        if (resolved.value !== 0) {
          detailDeduction += num(resolved.value);
          matchedDeductionItems += 1;
        }
      }

      for (let c = GC.DEFECT_FIRST; c <= GC.DEFECT_LAST; c += 1) {
        const type = typesF[c - GC.DEFECT_FIRST];
        const header = type?.name || type?.defect_name || type?.code || type?.defect_code || '';
        if (!header) continue;
        const resolved = defectValue(report, processData, header);
        row.getCell(c).value = num(resolved.value);
        if (resolved.value !== 0) {
          detailNg += num(resolved.value);
          matchedDefectItems += 1;
        }
        if (resolved.source === 'production_reports.legacy_fields') legacyDefectFallbackRows += 1;
      }

      const dbDeduction = num(report?.deduction_time);
      const dbNg = num(report?.tt_ng);
      row.getCell(GC.DEDUCTION_TOTAL).value = dbDeduction;
      row.getCell(GC.NG).value = dbNg;
      totalDeduction += dbDeduction;
      totalNg += dbNg;
    }

    const totalRow = [...(sheet._rows || [])].find((row) => {
      const text = norm(row?.getCell(1)?.value);
      return text.includes('TONG') && text.includes('CONG');
    });
    if (totalRow) {
      totalRow.getCell(GC.DEDUCTION_TOTAL).value = totalDeduction;
      totalRow.getCell(GC.NG).value = totalNg;
      for (let c = GC.DEDUCTION_FIRST; c <= GC.DEDUCTION_LAST; c += 1) totalRow.getCell(c).value = rows.reduce((sum, row) => sum + num(row.getCell(c).value), 0);
      for (let c = GC.DEFECT_FIRST; c <= GC.DEFECT_LAST; c += 1) totalRow.getCell(c).value = rows.reduce((sum, row) => sum + num(row.getCell(c).value), 0);
    }

    console.log('[KTC-EXCEL-TEMPLATE] GC_DB_DIRECT_DETAIL_MAPPING', JSON.stringify({
      reports: reports.length,
      excelReportRows: rows.length,
      deductionTypes: typesD.length,
      defectTypes: typesF.length,
      rawDeductionItems,
      rawDefectItems,
      matchedDeductionItems,
      matchedDefectItems,
      deductionTotalFromDb: totalDeduction,
      detailDeductionFromDb: detailDeduction,
      deductionGap: totalDeduction - detailDeduction,
      ngTotalFromDb: totalNg,
      detailNgFromDb: detailNg,
      ngGap: totalNg - detailNg,
      legacyDefectFallbackRows,
      totalRow: Boolean(totalRow)
    }));

    return Buffer.from(await wb.xlsx.writeBuffer());
  } finally {
    try { fs.unlinkSync(tmp); } catch (_) {}
  }
}

const originalBuildProcess = monthly.buildProcessWorkbookLocal;
const originalBuildSplit = monthly.buildSplitMonthlyWorkbooksLocal;
if (typeof originalBuildProcess === 'function') {
  monthly.buildProcessWorkbookLocal = async (args) => {
    const result = await originalBuildProcess(args);
    if (String(args?.processCode || '').toUpperCase() === 'GC' && result?.buffer) result.buffer = await patchGcBuffer(result.buffer, args?.payload || {});
    return result;
  };
}
if (typeof originalBuildSplit === 'function') {
  monthly.buildSplitMonthlyWorkbooksLocal = async (args) => {
    const result = await originalBuildSplit(args);
    for (const item of result?.processes || []) {
      if (String(item?.processCode || '').toUpperCase() === 'GC' && item?.buffer) item.buffer = await patchGcBuffer(item.buffer, args?.payload || {});
    }
    return result;
  };
}

module.exports = monthly;
