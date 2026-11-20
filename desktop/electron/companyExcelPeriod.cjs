'use strict';

// Company workbook period updates, including ExcelJS cached formula values and hidden metadata.
function createCompanyExcelPeriod({ safeText }) {
const MONTH_NAMES_EN = Object.freeze([
  ['January', 'Jan'], ['February', 'Feb'], ['March', 'Mar'], ['April', 'Apr'],
  ['May', 'May'], ['June', 'Jun'], ['July', 'Jul'], ['August', 'Aug'],
  ['September', 'Sep'], ['October', 'Oct'], ['November', 'Nov'], ['December', 'Dec']
]);

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function replaceWorkbookPeriodText(value, year, month) {
  if (typeof value !== 'string' || !value) return value;
  const monthNumber = Number(month);
  const [longMonth, shortMonth] = MONTH_NAMES_EN[monthNumber - 1];
  let next = value;

  // Chỉ thay các biểu thức kỳ/tháng rõ ràng, không thay số 7/8 đứng riêng để
  // tránh làm sai mã sản phẩm, định mức hoặc dữ liệu nguồn.
  next = next
    .replace(/\b(?:0?[1-9]|1[0-2])[\/-](?:19|20)\d{2}\b/g, `${month}-${year}`)
    .replace(/\b(?:19|20)\d{2}[\/-](?:0?[1-9]|1[0-2])\b/g, `${year}-${month}`)
    .replace(/\btháng\s+(?:0?[1-9]|1[0-2])\b/gi, `Tháng ${monthNumber}`)
    .replace(/\bmonth\s+(?:0?[1-9]|1[0-2])\b/gi, `Month ${monthNumber}`);

  for (const [sourceLong, sourceShort] of MONTH_NAMES_EN) {
    next = next
      .replace(new RegExp(`\\b${escapeRegExp(sourceLong)}\\b`, 'gi'), longMonth)
      .replace(new RegExp(`\\b${escapeRegExp(sourceShort)}\\b`, 'gi'), shortMonth);
  }
  return next;
}

function updateCellPeriod(cell, year, month, sourcePeriod) {
  const value = cell.value;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const valuePeriod = `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`;
    if (sourcePeriod && valuePeriod === sourcePeriod) {
      const targetYear = Number(year);
      const targetMonthIndex = Number(month) - 1;
      const lastDay = new Date(targetYear, targetMonthIndex + 1, 0).getDate();
      const targetDay = Math.min(value.getDate(), lastDay);
      cell.value = new Date(
        targetYear,
        targetMonthIndex,
        targetDay,
        value.getHours(),
        value.getMinutes(),
        value.getSeconds(),
        value.getMilliseconds()
      );
      return 1;
    }
    return 0;
  }
  if (typeof value === 'string') {
    const updated = replaceWorkbookPeriodText(value, year, month);
    if (updated !== value) cell.value = updated;
    return updated !== value ? 1 : 0;
  }
  if (!value || typeof value !== 'object') return 0;

  if (Array.isArray(value.richText)) {
    let changed = 0;
    const richText = value.richText.map((part) => {
      const text = replaceWorkbookPeriodText(String(part?.text ?? ''), year, month);
      if (text !== String(part?.text ?? '')) changed += 1;
      return { ...part, text };
    });
    if (changed) cell.value = { ...value, richText };
    return changed;
  }

  if (typeof value.formula === 'string') {
    const formula = replaceWorkbookPeriodText(value.formula, year, month);
    let result = value.result;
    let changed = formula !== value.formula;

    // ExcelJS giữ cached result của công thức. Nếu cached result vẫn là kỳ cũ
    // (ví dụ Jul) thì Excel có thể hiển thị Jul dù formula đã được thay đổi.
    // Cập nhật luôn cached result để file mở ra đúng ngay cả trước khi Excel recalc.
    if (result instanceof Date && !Number.isNaN(result.getTime())) {
      const resultPeriod = `${result.getFullYear()}-${String(result.getMonth() + 1).padStart(2, '0')}`;
      if (sourcePeriod && resultPeriod === sourcePeriod) {
        const targetYear = Number(year);
        const targetMonthIndex = Number(month) - 1;
        const lastDay = new Date(targetYear, targetMonthIndex + 1, 0).getDate();
        result = new Date(
          targetYear,
          targetMonthIndex,
          Math.min(result.getDate(), lastDay),
          result.getHours(),
          result.getMinutes(),
          result.getSeconds(),
          result.getMilliseconds()
        );
        changed = true;
      }
    } else if (typeof result === 'string') {
      const updatedResult = replaceWorkbookPeriodText(result, year, month);
      if (updatedResult !== result) {
        result = updatedResult;
        changed = true;
      }
    }

    if (changed) {
      cell.value = result === undefined
        ? { formula }
        : { formula, result };
      return 1;
    }
  }
  return 0;
}

function detectTemplatePeriod(workbook) {
  const counts = new Map();
  workbook.eachSheet((sheet) => {
    if (sheet.name === '_KTC_META') return;
    sheet.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        const value = cell.value;
        if (!(value instanceof Date) || Number.isNaN(value.getTime())) return;
        const key = `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`;
        counts.set(key, (counts.get(key) || 0) + 1);
      });
    });
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

function updateWorkbookPeriod(workbook, year, month) {
  let replacements = 0;
  const sourcePeriod = detectTemplatePeriod(workbook);
  workbook.eachSheet((sheet) => {
    sheet.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        replacements += updateCellPeriod(cell, year, month, sourcePeriod);
      });
    });

    const headerFooter = sheet.headerFooter || {};
    for (const key of ['oddHeader', 'oddFooter', 'evenHeader', 'evenFooter', 'firstHeader', 'firstFooter']) {
      if (typeof headerFooter[key] !== 'string') continue;
      const updated = replaceWorkbookPeriodText(headerFooter[key], year, month);
      if (updated !== headerFooter[key]) {
        headerFooter[key] = updated;
        replacements += 1;
      }
    }
  });

  let meta = workbook.getWorksheet('_KTC_META');
  if (!meta) meta = workbook.addWorksheet('_KTC_META');
  meta.state = 'veryHidden';
  meta.getCell('A1').value = 'YEAR_MONTH';
  meta.getCell('B1').value = `${year}-${month}`;
  meta.getCell('A2').value = 'GENERATED_AT';
  meta.getCell('B2').value = new Date().toISOString();
  meta.getCell('A3').value = 'GENERATOR';
  meta.getCell('B3').value = 'KTC_DESKTOP_COMPANY_EXCEL_V4';
  meta.getCell('A4').value = 'TEMPLATE_PERIOD';
  meta.getCell('B4').value = sourcePeriod || '';
  return replacements;
}

function assertWorkbookPeriod(workbook, year, month) {
  const meta = workbook.getWorksheet('_KTC_META');
  const actual = safeText(meta?.getCell('B1')?.value).slice(0, 7);
  const expected = `${year}-${month}`;
  if (actual !== expected) {
    throw new Error(`Kỳ workbook không hợp lệ: yêu cầu ${expected}, nhận ${actual || 'trống'}`);
  }
}


  return { replaceWorkbookPeriodText, updateCellPeriod, detectTemplatePeriod, updateWorkbookPeriod, assertWorkbookPeriod };
}
module.exports = { createCompanyExcelPeriod };
