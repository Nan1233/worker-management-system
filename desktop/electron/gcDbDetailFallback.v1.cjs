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
  DEFECT_FIRST: 36,
  DEFECT_LAST: 54,
  NG: 34
});

const norm = (value) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[đĐ]/g, 'd')
  .replace(/[^A-Za-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '')
  .toUpperCase();

const num = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const s = String(value ?? '').replace(/,/g, '').trim();
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

function parseExtraData(report) {
  const raw = report?.extra_data;
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  try {
    const value = JSON.parse(String(raw));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch (_) {
    return {};
  }
}

function extraColumns(report) {
  const extra = parseExtraData(report);
  const columns = extra?.columns;
  return columns && typeof columns === 'object' && !Array.isArray(columns) ? columns : {};
}

function extraValue(report, aliases) {
  const columns = extraColumns(report);
  const wanted = aliases.map(norm);
  for (const [key, value] of Object.entries(columns)) {
    if (!wanted.includes(norm(key))) continue;
    return num(value);
  }
  return 0;
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
  for (const name of names) {
    if (Array.isArray(report?.[name])) return report[name];
  }
  return [];
}

function typeKeys(type, kind) {
  if (!type) return [];
  return (kind === 'deduction'
    ? [type.id, type.code, type.deduction_code, type.name, type.deduction_name]
    : [type.id, type.code, type.defect_code, type.name, type.defect_name])
    .filter((v) => v !== null && v !== undefined && String(v) !== '')
    .map(norm);
}

function itemKeys(item, kind) {
  return (kind === 'deduction'
    ? [item?.deduction_type_id, item?.deduction_type_code, item?.deduction_code, item?.deduction_type_name, item?.deduction_name, item?.code, item?.name]
    : [item?.defect_type_id, item?.defect_type_code, item?.defect_code, item?.defect_type_name, item?.defect_name, item?.code, item?.name])
    .filter((v) => v !== null && v !== undefined && String(v) !== '')
    .map(norm);
}

function findChildValue(report, processData, header, kind) {
  const target = norm(header);
  let total = 0;
  let matched = false;
  const types = kind === 'deduction' ? processData?.deductionTypes : processData?.defectTypes;
  for (const item of detailArray(report, kind)) {
    const id = kind === 'deduction' ? item?.deduction_type_id : item?.defect_type_id;
    const type = Array.isArray(types)
      ? types.find((x) => String(x?.id ?? '') === String(id ?? ''))
      : null;
    const keys = [...itemKeys(item, kind), ...typeKeys(type, kind)];
    if (keys.includes(target)) {
      total += detailValue(item, kind);
      matched = true;
    }
  }
  return { value: total, matched };
}

const DEDUCTION_ALIASES = new Map([
  [norm('Thiếu sản lượng'), ['Thiếu sản lượng']],
  [norm('Bật máy, xét máy'), ['Bật máy, xét máy', 'Bật máy', 'Xét máy']],
  [norm('Chuyển mã'), ['Chuyển mã']],
  [norm('Chỉnh máy'), ['Chỉnh máy']],
  [norm('Chờ chỉnh máy'), ['Chờ chỉnh máy']],
  [norm('Mất điện'), ['Mất điện']],
  [norm('Mất khí'), ['Mất khí']],
  [norm('Chờ hàng'), ['Chờ hàng']],
  [norm('Bảo dưỡng máy'), ['Bảo dưỡng máy']],
  [norm('Nghỉ giải lao'), ['Nghỉ giải lao']],
  [norm('Giao ca'), ['Giao ca']],
  [norm('Dừng máy đi hỗ trợ'), ['Dừng máy đi hỗ trợ']],
  [norm('Giặt cs/cân cs, tuốt-tái pp, GL'), ['Giặt cs/cân cs, tuốt-tái pp, GL']],
  [norm('5s'), ['5s', '5S']],
  [norm('Học việc, đào tạo'), ['Học việc, đào tạo']],
  [norm('Đi muộn về sớm'), ['Đi muộn về sớm', 'Đi muộn, về sớm']]
]);

const DEFECT_ALIASES = new Map([
  [norm('KQD'), ['KQD']],
  [norm('Vỡ cao su'), ['Vỡ cao su']],
  [norm('K xước cong gãy'), ['K xước cong gãy']],
  [norm('Cao su xoay'), ['Cao su xoay']],
  [norm('Cắt không đứt'), ['Cắt không đứt']],
  [norm('bavia'), ['bavia']],
  [norm('CSH'), ['CSH']],
  [norm('ppcm'), ['ppcm']],
  [norm('KT lớn'), ['KT lớn']],
  [norm('KT nhỏ'), ['KT nhỏ']],
  [norm('LCS'), ['LCS']],
  [norm('cắt lẹm'), ['cắt lẹm']],
  [norm('rách nvl'), ['rách nvl']],
  [norm('Chân ngắn dài'), ['Chân ngắn dài']],
  [norm('sót via'), ['sót via']],
  [norm('fure trục'), ['fure trục']],
  [norm('lẫn cs'), ['lẫn cs']],
  [norm('bavia cắt hụt'), ['bavia cắt hụt']],
  [norm('thiếu cao su'), ['thiếu cao su']]
]);

function deductionFromStoredSources(report, processData, header) {
  const child = findChildValue(report, processData, header, 'deduction');
  if (child.matched && child.value !== 0) return { value: child.value, source: 'production_report_deductions' };
  const aliases = DEDUCTION_ALIASES.get(norm(header)) || [header];
  const value = extraValue(report, aliases);
  if (value !== 0 || !child.matched) return { value, source: value !== 0 ? 'production_reports.extra_data.columns' : child.matched ? 'production_report_deductions_zero' : 'none' };
  return { value: child.value, source: 'production_report_deductions' };
}

function parentDefectValue(report, header) {
  const h = norm(header);
  const parent = {
    VO_CAO_SU: ['vo_do_long'],
    CAO_SU_XOAY: ['xoay'],
    CAT_KHONG_DUT: ['khong_dut'],
    BAVIA: ['bavia_hut'],
    PPCM: ['ppcm'],
    KT_LON: ['ng_kich_thuoc'],
    LCS: ['loi_cao_su'],
    CAT_LEM: ['cat_lem']
  };
  if (h === 'KQD') {
    const value = num(report?.kqd_dap_lai) + num(report?.kqd_tuot);
    return value !== 0 ? value : extraValue(report, ['KQD']);
  }
  if (h === 'K_XUOC_CONG_GAY') {
    const value = num(report?.xuoc_do_long) + num(report?.cong_gay);
    return value !== 0 ? value : extraValue(report, ['K xước cong gãy']);
  }
  const fields = parent[h];
  if (fields) {
    const value = fields.reduce((sum, field) => sum + num(report?.[field]), 0);
    return value !== 0 ? value : extraValue(report, DEFECT_ALIASES.get(h) || [header]);
  }
  return extraValue(report, DEFECT_ALIASES.get(h) || [header]);
}

function defectFromStoredSources(report, processData, header) {
  const child = findChildValue(report, processData, header, 'defect');
  if (child.matched && child.value !== 0) return { value: child.value, source: 'production_report_defects' };
  const parentValue = parentDefectValue(report, header);
  if (parentValue !== 0) return { value: parentValue, source: 'production_reports' };
  if (child.matched) return { value: child.value, source: 'production_report_defects_zero' };
  return { value: 0, source: 'none' };
}

function reportRows(sheet) {
  return [...(sheet._rows || [])]
    .filter((row) => {
      const stt = row?.getCell(1)?.value;
      const worker = row?.getCell(2)?.value;
      return typeof stt === 'number' && Number.isFinite(stt) && worker !== null && worker !== undefined && String(worker) !== '';
    })
    .sort((a, b) => a.number - b.number);
}

function reportsFromPayload(payload) {
  const list = Array.isArray(payload?.processes?.GC?.reports) ? [...payload.processes.GC.reports] : [];
  return list.sort((a, b) => String(a?.work_date || '').localeCompare(String(b?.work_date || ''))
    || String(a?.approved_at || a?.created_at || '').localeCompare(String(b?.approved_at || b?.created_at || ''))
    || Number(a?.id || 0) - Number(b?.id || 0));
}

function setDetail(row, column, value) {
  row.getCell(column).value = num(value);
}

function patchGcBuffer(buffer, payload) {
  return (async () => {
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
      const rows = reportRows(sheet);
      if (rows.length < reports.length) throw new Error(`GC export thiếu dòng report: Excel=${rows.length}, DB=${reports.length}`);

      let totalDeduction = 0;
      let totalNg = 0;
      let detailDeduction = 0;
      let detailNg = 0;
      let fallbackDeductionRows = 0;
      let fallbackDefectRows = 0;

      for (let i = 0; i < reports.length; i += 1) {
        const report = reports[i];
        const row = rows[i];
        let rowDetailDeduction = 0;
        let rowDetailNg = 0;
        let usedDeductionFallback = false;
        let usedDefectFallback = false;

        const typesD = Array.isArray(processData.deductionTypes) ? processData.deductionTypes : [];
        const typesF = Array.isArray(processData.defectTypes) ? processData.defectTypes : [];
        for (let c = GC.DEDUCTION_FIRST; c <= GC.DEDUCTION_LAST; c += 1) {
          const type = typesD[c - GC.DEDUCTION_FIRST];
          const header = type?.name || type?.deduction_name || type?.code || type?.deduction_code || '';
          if (!header) continue;
          const resolved = deductionFromStoredSources(report, processData, header);
          setDetail(row, c, resolved.value);
          rowDetailDeduction += resolved.value;
          if (resolved.source !== 'production_report_deductions') usedDeductionFallback = true;
        }

        for (let c = GC.DEFECT_FIRST; c <= GC.DEFECT_LAST; c += 1) {
          const type = typesF[c - GC.DEFECT_FIRST];
          const header = type?.name || type?.defect_name || type?.code || type?.defect_code || '';
          if (!header) continue;
          const resolved = defectFromStoredSources(report, processData, header);
          setDetail(row, c, resolved.value);
          rowDetailNg += resolved.value;
          if (resolved.source !== 'production_report_defects') usedDefectFallback = true;
        }

        const dbDeduction = num(report?.deduction_time);
        const dbNg = num(report?.tt_ng);
        setDetail(row, GC.DEDUCTION_TOTAL, dbDeduction);
        setDetail(row, GC.NG, dbNg);
        totalDeduction += dbDeduction;
        totalNg += dbNg;
        detailDeduction += rowDetailDeduction;
        detailNg += rowDetailNg;
        if (usedDeductionFallback) fallbackDeductionRows += 1;
        if (usedDefectFallback) fallbackDefectRows += 1;
      }

      const totalRow = [...(sheet._rows || [])].find((row) => {
        const text = norm(row?.getCell(1)?.value);
        return text.includes('TONG') && text.includes('CONG');
      });
      if (totalRow) {
        setDetail(totalRow, GC.DEDUCTION_TOTAL, totalDeduction);
        setDetail(totalRow, GC.NG, totalNg);
        for (let c = GC.DEDUCTION_FIRST; c <= GC.DEDUCTION_LAST; c += 1) {
          setDetail(totalRow, c, rows.slice(0, reports.length).reduce((sum, row) => sum + num(row.getCell(c).value), 0));
        }
        for (let c = GC.DEFECT_FIRST; c <= GC.DEFECT_LAST; c += 1) {
          setDetail(totalRow, c, rows.slice(0, reports.length).reduce((sum, row) => sum + num(row.getCell(c).value), 0));
        }
      }

      console.log('[KTC-EXCEL-TEMPLATE] GC_DB_SOURCE_DETAIL_FALLBACK', JSON.stringify({
        reports: reports.length,
        deductionTypes: typesD.length,
        defectTypes: typesF.length,
        deductionTotalFromDb: totalDeduction,
        detailDeductionFromDb: detailDeduction,
        deductionGap: totalDeduction - detailDeduction,
        ngTotalFromDb: totalNg,
        detailNgFromDb: detailNg,
        ngGap: totalNg - detailNg,
        fallbackDeductionRows,
        fallbackDefectRows,
        totalRow: Boolean(totalRow)
      }));

      return Buffer.from(await wb.xlsx.writeBuffer());
    } finally {
      try { fs.unlinkSync(tmp); } catch (_) {}
    }
  })();
}

const originalBuildProcess = monthly.buildProcessWorkbookLocal;
const originalBuildSplit = monthly.buildSplitMonthlyWorkbooksLocal;

if (typeof originalBuildProcess === 'function') {
  monthly.buildProcessWorkbookLocal = async (args = {}) => {
    const result = await originalBuildProcess(args);
    if (String(args?.processCode || '').toUpperCase() === 'GC' && result?.buffer) {
      result.buffer = await patchGcBuffer(result.buffer, args?.payload || {});
    }
    return result;
  };
}

if (typeof originalBuildSplit === 'function') {
  monthly.buildSplitMonthlyWorkbooksLocal = async (args = {}) => {
    const result = await originalBuildSplit(args);
    for (const item of result?.processes || []) {
      if (String(item?.processCode || '').toUpperCase() === 'GC' && item?.buffer) {
        item.buffer = await patchGcBuffer(item.buffer, args?.payload || {});
      }
    }
    return result;
  };
}

module.exports = monthly;
