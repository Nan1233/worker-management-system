const path = require('node:path');
const fs = require('node:fs');
const ExcelJS = require('exceljs');

const GROUPS = Object.freeze({
  GIA_CONG: {
    code: 'GIA_CONG',
    title: 'Gia công',
    template: 'bao-cao-cat-long-export.xlsx',
    fileName: ({ month, year }) => `A+B GIA CÔNG THÁNG ${month}-${year}.xlsx`,
    // Các sheet khác chỉ được giữ để tra cứu/tính toán. Chỉ ghi dữ liệu vào Cắt lồng.
    sheets: [{ processCodes: ['GC'], sheetName: 'Cắt lồng', layout: 'GIA_CONG' }]
  },
  MAI_DO: {
    code: 'MAI_DO',
    title: 'Mài - Đo',
    template: 'bao-cao-mai-do-export.xlsx',
    fileName: ({ month, year }) => `A+B MÀI - ĐO THÁNG ${month}-${year}.xlsx`,
    sheets: [
      { processCodes: ['MAI'], sheetName: 'TT Mài', layout: 'MAI' },
      { processCodes: ['DO'], sheetName: 'TT Đo', layout: 'DO' }
    ]
  }
});

const LAYOUTS = Object.freeze({
  GIA_CONG: {
    headerSearchColumn: 31,
    headerPattern: /ngày\s*\/?\s*tháng/i,
    lastReportColumn: 54,
    fixed: {
      sequence: 1, workerCode: 2, workerName: 3, machine: 4, shift: 5,
      training: 6, totalTime: 7, actualTime: 8, changeCount: 9,
      deductionTotal: 10, product: 27, standardOutput: 28,
      actualOutput: 29, achievement: 30, workDate: 31,
      outputPerHour: 32, ok: 33, totalNg: 34, ngRate: 35
    },
    deductions: [11, 26],
    defects: [36, 53],
    deductionCodeColumns: {
      THIEU_SP: 11,
      BAT_MAY: 12,
      CHUYEN_MA: 13,
      CHINH_MAY: 14,
      CHO_CHINH_MAY: 15,
      MAT_DIEN: 16,
      MAT_KHI: 17,
      CHO_HANG: 18,
      BAO_DUONG: 19,
      NGHI_GIAI_LAO: 20,
      GIAO_CA: 21,
      HO_TRO: 22,
      GIAT_CAN_TUOT: 23,
      '5S': 24,
      HOC_VIEC: 25,
      DI_MUON_VE_SOM: 26
    },
    defectCodeColumns: {
      KQD: 36,
      VO_CAO_SU: 37,
      K_XUOC_CONG_GAY: 38,
      CAO_SU_XOAY: 39,
      CAT_KHONG_DUT: 40,
      BAVIA: 41,
      CSH: 42,
      PPCM: 43,
      KT_LON: 44,
      KT_NHO: 45,
      LCS: 46,
      CAT_LEM: 47,
      RACH_NVL: 48,
      CHAN_NGAN_DAI: 49,
      SOT_VIA: 50,
      FURE_TRUC: 51,
      LAN_CS: 52,
      BAVIA_CAT_HUT: 53,
      THIEU_CAO_SU: 54
    }
  },
  MAI: {
    blockStrategy: 'date-anchor',
    headerSearchColumn: 36,
    headerPattern: /ngày/i,
    blockStartOffset: 2,
    blockEndOffset: 1,
    lastReportColumn: 46,
    fixed: {
      sequence: 1, workerCode: 2, workerName: 3, shift: 4, machine: 5,
      training: 8, actualTime: 9, totalTime: 10, deductionTotal: 11,
      product: 32, standardOutput: 33, actualOutput: 34,
      achievement: 35, workDate: 36, outputPerHour: 37,
      ok: 38, totalNg: 39
    },
    deductions: [12, 31],
    defects: [40, 46]
  },
  DO: {
    headerSearchColumn: 32,
    headerPattern: /ngày/i,
    lastReportColumn: 49,
    fixed: {
      sequence: 1, workerCode: 2, workerName: 3, shift: 4, machine: 5,
      training: 7, totalTime: 8, actualTime: 9, deductionTotal: 10,
      product: 28, standardOutput: 29, actualOutput: 30,
      achievement: 31, workDate: 32, outputPerHour: 33,
      ok: 34, totalNg: 35, ngRate: 36
    },
    deductions: [11, 27],
    defects: [37, 49]
  }
});

const safeText = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) return value.richText.map((x) => String(x?.text ?? '')).join('');
    if (value.text !== undefined) return String(value.text ?? '');
    if (value.result !== undefined) return String(value.result ?? '');
    if (value.formula !== undefined) return String(value.result ?? '');
  }
  return String(value);
};

const num = (value) => {
  const parsed = Number(safeText(value ?? 0).replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeCode = (value) => safeText(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/Đ/g, 'D')
  .replace(/[^A-Za-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '')
  .toUpperCase();

const dateKey = (value) => {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const toExcelDate = (value) => {
  const key = dateKey(value);
  if (!key) return null;
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const setCell = (row, column, value, format) => {
  if (!column) return;
  const cell = row.getCell(column);
  cell.value = value;
  if (format) cell.numFmt = format;
};

const uniqueBy = (items, keyFn) => {
  const result = [];
  const seen = new Set();
  for (const item of items || []) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
};

function getMergedCellValue(cell) {
  try {
    if (cell?.isMerged && cell.master && cell.master !== cell) {
      return cell.master.value ?? '';
    }
    return cell?.value ?? '';
  } catch {
    return '';
  }
}

function getFormulaText(value) {
  if (value && typeof value === 'object' && typeof value.formula === 'string') {
    return value.formula.trim();
  }
  if (typeof value === 'string' && value.trim().startsWith('=')) {
    return value.trim().slice(1);
  }
  return '';
}

function normalizedFormula(value) {
  return getFormulaText(value)
    .replace(/^=/, '')
    .replace(/\s+/g, '')
    .toUpperCase();
}

function isCopiedHeaderRow(sheet, rowNumber) {
  const nextRow = sheet.getRow(rowNumber + 1);
  const formulaB = normalizedFormula(getMergedCellValue(nextRow.getCell(2)));
  const formulaA = normalizedFormula(getMergedCellValue(nextRow.getCell(1)));
  return formulaB.includes('$B$2') || formulaA.includes('$A$2');
}

function isDateAnchorCell(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return true;
  const formula = normalizedFormula(value);
  // ExcelJS lưu công thức trong value.formula, còn value.result có thể là ngày đã cache.
  // Ví dụ TT Mài: A342 là Date; A494 có formula +A342+1.
  return /^\+?\$?A\$?\d+\+1$/i.test(formula);
}

function findDateAnchorRows(sheet) {
  const candidates = [];
  for (let rowNumber = 1; rowNumber < sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const anchorValue = getMergedCellValue(row.getCell(1));
    const columnBValue = getMergedCellValue(row.getCell(2));
    const columnBText = safeText(columnBValue).trim();
    const columnBFormula = getFormulaText(columnBValue);
    if (!isDateAnchorCell(anchorValue)) continue;
    if (columnBText || columnBFormula) continue;
    if (!isCopiedHeaderRow(sheet, rowNumber)) continue;
    candidates.push(rowNumber);
  }

  if (candidates.length <= 1) return candidates;

  // Giữ chuỗi block chi tiết có bước lặp ổn định; loại vùng tổng hợp đầu sheet.
  const gaps = candidates.slice(1).map((row, index) => row - candidates[index]);
  const gapCounts = new Map();
  for (const gap of gaps) {
    if (gap < 20 || gap > 300) continue;
    gapCounts.set(gap, (gapCounts.get(gap) || 0) + 1);
  }
  const dominantGap = [...gapCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0];

  if (!dominantGap) return candidates.slice(0, 31);

  let best = [];
  let current = [candidates[0]];
  for (let index = 1; index < candidates.length; index += 1) {
    const gap = candidates[index] - candidates[index - 1];
    if (Math.abs(gap - dominantGap) <= 2) {
      current.push(candidates[index]);
    } else {
      if (current.length > best.length) best = current;
      current = [candidates[index]];
    }
  }
  if (current.length > best.length) best = current;
  return (best.length ? best : candidates).slice(0, 31);
}

function findTextHeaderRows(sheet, layout) {
  const headers = [];
  const candidateColumns = [layout.headerSearchColumn];
  for (let column = 1; column <= Math.min(sheet.columnCount, layout.lastReportColumn || sheet.columnCount); column += 1) {
    if (!candidateColumns.includes(column)) candidateColumns.push(column);
  }

  for (let rowNumber = 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    for (const column of candidateColumns) {
      const text = safeText(getMergedCellValue(sheet.getRow(rowNumber).getCell(column))).trim();
      if (!text) continue;
      layout.headerPattern.lastIndex = 0;
      if (layout.headerPattern.test(text)) {
        headers.push(rowNumber);
        break;
      }
    }
  }
  return [...new Set(headers)];
}

function findBlocks(sheet, layout) {
  let headers = [];
  let startOffset = Number(layout.blockStartOffset || 1);
  let endOffset = Number(layout.blockEndOffset || 2);

  if (layout.blockStrategy === 'date-anchor') {
    headers = findDateAnchorRows(sheet);
  }

  if (!headers.length) {
    headers = findTextHeaderRows(sheet, layout);
    startOffset = 1;
    endOffset = 2;
  }

  if (!headers.length) {
    throw new Error(`Không tìm thấy cấu trúc ngày hợp lệ trong sheet ${sheet.name}`);
  }

  // File chuẩn phải có tối đa 31 khối ngày. Loại các kết quả nhiễu ở vùng tổng hợp.
  if (headers.length > 31) headers = headers.slice(0, 31);

  return headers.map((headerRow, index) => ({
    headerRow,
    startRow: headerRow + startOffset,
    endRow: (headers[index + 1] || (sheet.rowCount + endOffset)) - endOffset
  })).filter((block) => block.endRow >= block.startRow);
}

function materializeSharedFormulas(workbook) {
  workbook.eachSheet((sheet) => {
    sheet.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        const value = cell.value;
        if (!value || typeof value !== 'object' || !value.sharedFormula) return;
        try {
          const formula = cell.formula;
          cell.value = formula
            ? { formula, result: value.result ?? cell.result ?? null }
            : (value.result ?? null);
        } catch {
          cell.value = value.result ?? null;
        }
      });
    });
  });
}


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

function clearReportRow(row, lastColumn) {
  for (let column = 1; column <= lastColumn; column += 1) {
    row.getCell(column).value = null;
  }
}

function clearBlock(sheet, block, layout) {
  for (let rowNumber = block.startRow; rowNumber <= block.endRow; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    clearReportRow(row, layout.lastReportColumn);
    row.hidden = true;
  }
}

function sumDetails(items, valueKey) {
  return (items || []).reduce((sum, item) => sum + num(item?.[valueKey]), 0);
}

function getMetrics(report) {
  const ok = num(report.tt_ok ?? report.ok_quantity ?? report.ok);
  const totalNg = sumDetails(report.defects, 'quantity');
  const actualTime = num(report.actual_time ?? report.working_time ?? report.work_time);
  const totalTime = num(report.total_time) || (actualTime + sumDetails(report.deductions, 'hours'));
  const rawTraining = report.training_percent === null || report.training_percent === undefined || (typeof report.training_percent === 'string' && report.training_percent.trim() === '')
    ? 100
    : num(report.training_percent);
  const trainingPercent = Math.min(100, Math.max(0, rawTraining));
  const trainingFactor = trainingPercent / 100;
  // Không làm tròn định mức theo giờ. Nhiều mã có định mức thập phân
  // (ví dụ 6.315789 SP/giờ); làm tròn sẽ khiến TT và tỷ lệ đạt sai.
  const standardOutput = num(report.standard_output ?? report.standard_output_per_hour ?? report.standard);
  const countedNg = (report.defects || []).reduce((sum, item) => {
    const code = normalizeCode(item.defect_code || item.code);
    if (code === 'KQD' && Number(report.exclude_kqd_from_tt || 0) === 1) return sum;
    return sum + num(item.quantity);
  }, 0);
  const hasActualOutput = report.actual_output !== null && report.actual_output !== undefined && safeText(report.actual_output).trim() !== '';
  const actualOutput = hasActualOutput ? num(report.actual_output) : ok + countedNg;
  const outputPerHour = actualTime > 0 ? actualOutput / actualTime : 0;
  const achievement = standardOutput > 0 ? outputPerHour / standardOutput : 0;
  const ngRate = (ok + totalNg) > 0 ? totalNg / (ok + totalNg) : 0;
  const deductionTotal = sumDetails(report.deductions, 'hours');
  const changeCount = (report.deductions || []).filter((item) =>
    normalizeCode(item.deduction_code || item.code) === 'CHUYEN_MA' && num(item.hours) > 0
  ).length;

  return {
    ok,
    totalNg,
    actualTime,
    totalTime,
    trainingPercent,
    standardOutput,
    actualOutput,
    outputPerHour,
    achievement,
    ngRate,
    deductionTotal,
    changeCount
  };
}

function writeDetailColumns(row, report, layout, deductionTypes, defectTypes) {
  if (layout.deductionCodeColumns) {
    const totalsByColumn = new Map();
    for (const item of report.deductions || []) {
      const code = normalizeCode(item.deduction_code || item.code || item.deduction_name);
      const column = layout.deductionCodeColumns[code];
      if (column) totalsByColumn.set(column, (totalsByColumn.get(column) || 0) + num(item.hours));
    }
    for (const [column, value] of totalsByColumn) setCell(row, column, value, '0.00');
  } else {
    const [start, end] = layout.deductions;
    deductionTypes.slice(0, end - start + 1).forEach((type, index) => {
      const typeId = Number(type.id);
      const value = (report.deductions || [])
        .filter((item) => Number(item.deduction_type_id) === typeId)
        .reduce((sum, item) => sum + num(item.hours), 0);
      setCell(row, start + index, value, '0.00');
    });
  }

  if (layout.defectCodeColumns) {
    const totalsByColumn = new Map();
    for (const item of report.defects || []) {
      const code = normalizeCode(item.defect_code || item.code || item.defect_name);
      const column = layout.defectCodeColumns[code];
      if (column) totalsByColumn.set(column, (totalsByColumn.get(column) || 0) + num(item.quantity));
    }
    for (const [column, value] of totalsByColumn) setCell(row, column, value, '#,##0');
  } else {
    const [start, end] = layout.defects;
    defectTypes.slice(0, end - start + 1).forEach((type, index) => {
      const typeId = Number(type.id);
      const value = (report.defects || [])
        .filter((item) => Number(item.defect_type_id) === typeId)
        .reduce((sum, item) => sum + num(item.quantity), 0);
      setCell(row, start + index, value, '#,##0');
    });
  }
}


function excelColumnName(columnNumber) {
  let value = Number(columnNumber);
  let result = '';
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function getMachineLines(report) {
  if (Array.isArray(report.machine_lines)) return report.machine_lines;
  if (Array.isArray(report.machines)) return report.machines;
  if (Array.isArray(report.machine_details)) return report.machine_details;
  return [];
}

function getMachineText(report) {
  const direct = safeText(report.machine_no || report.machine_code).trim();
  const codes = getMachineLines(report)
    .map((item) => safeText(item.machine_no || item.machine_code || item.code).trim())
    .filter(Boolean);
  return [...new Set([direct, ...codes].filter(Boolean))].join(', ');
}

function setFormula(row, column, formula, result, format) {
  if (!column) return;
  const cell = row.getCell(column);
  cell.value = { formula, result: result ?? 0 };
  if (format) cell.numFmt = format;
}

function plannedOutputFormula(rowNumber) {
  const parts = [];
  for (let headerRow = 5; headerRow <= 17; headerRow += 2) {
    const valueRow = headerRow + 1;
    parts.push(`H${rowNumber}*F${rowNumber}*SUMIF('KẾ HOẠCH'!$B$${headerRow}:$CK$${headerRow},AA${rowNumber},'KẾ HOẠCH'!$B$${valueRow}:$CK$${valueRow})`);
  }
  return parts.join('+');
}

function clearGiaCongRow(row, layout) {
  for (let column = 1; column <= layout.lastReportColumn; column += 1) {
    row.getCell(column).value = null;
  }
}

function writeGiaCongRow(sheet, rowNumber, report, layout, sequence) {
  const row = sheet.getRow(rowNumber);
  const fixed = layout.fixed;
  const metrics = getMetrics(report);
  const workDate = toExcelDate(report.work_date);
  const dateSerial = workDate ? Math.floor((workDate.getTime() - new Date(1899, 11, 30).getTime()) / 86400000) : 0;

  row.hidden = false;
  clearGiaCongRow(row, layout);

  setCell(row, fixed.sequence, sequence, '0');
  setCell(row, fixed.workerCode, safeText(report.worker_code));
  // Ghi trực tiếp tên công nhân từ DB. Không dùng VLOOKUP vì mã NV trong
  // sheet nguồn có thể là số trong khi API trả chuỗi, gây #N/A; đồng thời
  // tuyệt đối không fallback sang trường `name` vì trường đó có thể là tên SP.
  setCell(row, fixed.workerName, safeText(
    report.full_name || report.worker_name || report.worker_full_name || report.user_full_name
  ));
  setCell(row, fixed.machine, getMachineText(report));
  setCell(row, fixed.shift, safeText(report.shift).toUpperCase());
  setCell(row, fixed.training, metrics.trainingPercent / 100, '0%');
  setCell(row, fixed.totalTime, metrics.totalTime, '0.00');

  writeDetailColumns(row, report, layout, [], []);

  setFormula(row, fixed.deductionTotal, `SUM(K${rowNumber}:Z${rowNumber})`, metrics.deductionTotal, '0.00');
  setFormula(row, fixed.actualTime, `MAX(0,G${rowNumber}-J${rowNumber})`, metrics.actualTime, '0.00');
  setCell(row, fixed.changeCount, metrics.changeCount, '0');
  setCell(row, fixed.product, safeText(report.product_code || report.product_name));
  setFormula(row, fixed.standardOutput, plannedOutputFormula(rowNumber), metrics.standardOutput * metrics.actualTime * (metrics.trainingPercent / 100), '#,##0.00');
  setCell(row, fixed.actualOutput, metrics.actualOutput, '#,##0');
  setFormula(row, fixed.achievement, `IFERROR(AC${rowNumber}/AB${rowNumber},0)`, metrics.achievement, '0.00%');
  setCell(row, fixed.workDate, workDate, 'dd/mm/yyyy');
  setFormula(row, fixed.outputPerHour, `IFERROR(AC${rowNumber}/H${rowNumber},0)`, metrics.outputPerHour, '#,##0');
  setCell(row, fixed.ok, metrics.ok, '#,##0');
  setFormula(row, fixed.totalNg, `SUM(AJ${rowNumber}:BB${rowNumber})`, metrics.totalNg, '#,##0');
  setFormula(row, fixed.ngRate, `IFERROR(AH${rowNumber}/AC${rowNumber},0)`, metrics.ngRate, '0.00%');
}

function writeRow(sheet, rowNumber, report, layout, deductionTypes, defectTypes, sequence) {
  if (layout === LAYOUTS.GIA_CONG) {
    writeGiaCongRow(sheet, rowNumber, report, layout, sequence);
    return;
  }
  const row = sheet.getRow(rowNumber);
  const fixed = layout.fixed;
  const metrics = getMetrics(report);

  row.hidden = false;
  clearReportRow(row, layout.lastReportColumn);

  setCell(row, fixed.sequence, sequence, '0');
  setCell(row, fixed.workerCode, safeText(report.worker_code));
  setCell(row, fixed.workerName, safeText(
    report.full_name || report.worker_name || report.worker_full_name || report.user_full_name
  ));
  setCell(row, fixed.machine, getMachineText(report));
  setCell(row, fixed.shift, safeText(report.shift));
  setCell(row, fixed.training, metrics.trainingPercent / 100, '0%');
  setCell(row, fixed.totalTime, metrics.totalTime, '0.00');
  setCell(row, fixed.actualTime, metrics.actualTime, '0.00');
  setCell(row, fixed.changeCount, metrics.changeCount, '0');
  setCell(row, fixed.deductionTotal, metrics.deductionTotal, '0.00');
  setCell(row, fixed.product, safeText(report.product_code || report.product_name));
  setCell(row, fixed.standardOutput, metrics.standardOutput, '#,##0.000000');
  setCell(row, fixed.actualOutput, metrics.actualOutput, '#,##0');
  setCell(row, fixed.achievement, metrics.achievement, '0.00%');
  setCell(row, fixed.workDate, toExcelDate(report.work_date), 'dd/mm/yyyy');
  setCell(row, fixed.outputPerHour, metrics.outputPerHour, '#,##0');
  setCell(row, fixed.ok, metrics.ok, '#,##0');
  setCell(row, fixed.totalNg, metrics.totalNg, '#,##0');
  setCell(row, fixed.ngRate, metrics.ngRate, '0.00%');

  writeDetailColumns(row, report, layout, deductionTypes, defectTypes);
}

function isValidReport(report) {
  if (!report) return false;
  const hasWorker = Boolean(safeText(report.worker_code).trim());
  const hasProduct = Boolean(safeText(report.product_code || report.product_name).trim());
  return hasWorker && hasProduct && Boolean(dateKey(report.work_date));
}

async function buildCompanyExcelLocal({ appPath, date, groupCode, payload, existingFilePath }) {
  const group = GROUPS[safeText(groupCode).toUpperCase()];
  if (!group) throw new Error('Nhóm file Excel không hợp lệ');

  const [year, month] = safeText(date).split('-');
  const groupData = payload?.groups?.[group.code];
  if (!groupData) throw new Error(`Backend thiếu dữ liệu ${group.code}`);

  const workbook = new ExcelJS.Workbook();
  const templatePath = path.join(appPath, 'assets', 'templates', group.template);
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Không tìm thấy template Excel công ty: ${templatePath}`);
  }

  // Luôn dựng lại từ template chuẩn của ứng dụng. Không dùng file tháng đang
  // tồn tại hoặc .pending.xlsx làm nguồn vì chúng có thể chứa kỳ cũ (Jul/07)
  // và dữ liệu DB của lần đồng bộ trước.
  const sourcePath = templatePath;
  await workbook.xlsx.readFile(sourcePath);
  materializeSharedFormulas(workbook);
  const periodReplacementCount = updateWorkbookPeriod(workbook, year, month);
  assertWorkbookPeriod(workbook, year, month);
  workbook.calcProperties.fullCalcOnLoad = true;
  workbook.calcProperties.forceFullCalc = true;
  workbook.calcProperties.calcMode = 'auto';

  for (const sheetConfig of group.sheets) {
    const selected = (groupData.processes || []).filter((item) =>
      sheetConfig.processCodes.includes(safeText(item.process?.process_code).toUpperCase())
    );

    const reports = selected
      .flatMap((item) => item.reports || [])
      .filter(isValidReport)
      .sort((a, b) => dateKey(a.work_date).localeCompare(dateKey(b.work_date))
        || safeText(a.approved_at || a.created_at || a.entry_date || a.work_date).localeCompare(safeText(b.approved_at || b.created_at || b.entry_date || b.work_date))
        || safeText(a.worker_code).localeCompare(safeText(b.worker_code), undefined, { numeric: true })
        || safeText(a.machine_no).localeCompare(safeText(b.machine_no), undefined, { numeric: true })
        || Number(a.id) - Number(b.id));

    const deductionTypes = uniqueBy(
      selected.flatMap((item) => item.deductionTypes || []),
      (item) => String(item.id || normalizeCode(item.deduction_code || item.code))
    );
    const defectTypes = uniqueBy(
      selected.flatMap((item) => item.defectTypes || []),
      (item) => String(item.id || normalizeCode(item.defect_code || item.code))
    );

    const sheet = workbook.getWorksheet(sheetConfig.sheetName);
    if (!sheet) throw new Error(`Thiếu sheet ${sheetConfig.sheetName}`);
    const layout = LAYOUTS[sheetConfig.layout];
    const blocks = findBlocks(sheet, layout);

    // Chỉ làm sạch vùng dữ liệu của sheet đích. Các sheet nguồn khác được giữ nguyên tuyệt đối.
    for (const block of blocks) clearBlock(sheet, block, layout);

    const reportsByDay = new Map();
    for (const report of reports) {
      const key = dateKey(report.work_date);
      const day = Number(key.slice(8, 10));
      if (!reportsByDay.has(day)) reportsByDay.set(day, []);
      reportsByDay.get(day).push(report);
    }

    for (const [day, dayReports] of reportsByDay) {
      const block = blocks[day - 1];
      if (!block) continue;
      const capacity = block.endRow - block.startRow + 1;
      if (dayReports.length > capacity) {
        throw new Error(`Ngày ${day} có ${dayReports.length} báo cáo, vượt sức chứa ${capacity} dòng của sheet ${sheet.name}`);
      }
      dayReports.forEach((report, index) => {
        writeRow(sheet, block.startRow + index, report, layout, deductionTypes, defectTypes, index + 1);
      });
    }
  }

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return {
    buffer,
    fileName: group.fileName({ year, month }),
    groupTitle: group.title,
    sourcePath,
    reusedExistingFile: false,
    requestedYearMonth: `${year}-${month}`,
    periodReplacementCount
  };
}


const PROCESS_REPORT_GROUPS = Object.freeze({
  GC: {
    key: 'GC', processCode: 'GC', processName: 'Gia công', slug: 'Gia-cong',
    groupCode: 'GIA_CONG', processCodes: ['GC'], template: 'file-mau.xlsx',
    sheets: [{ processCodes: ['GC'], sheetName: 'Cắt lồng', layout: 'GIA_CONG' }]
  },
  MAI_DO: {
    key: 'MAI_DO', processCode: 'MAI_DO', processName: 'Mài - Đo', slug: 'Mai-Do',
    groupCode: 'MAI_DO', processCodes: ['MAI', 'DO'], template: 'file-mau.xlsx',
    sheets: [
      { processCodes: ['MAI'], sheetName: 'TT Mài', layout: 'MAI' },
      { processCodes: ['DO'], sheetName: 'TT Đo', layout: 'DO' }
    ]
  }
});

function resolveProcessReportGroup(processCode) {
  const code = safeText(processCode).toUpperCase();
  if (code === 'GC') return PROCESS_REPORT_GROUPS.GC;
  if (code === 'MAI' || code === 'DO' || code === 'MAI_DO') return PROCESS_REPORT_GROUPS.MAI_DO;
  throw new Error(`Chưa có mẫu báo cáo công đoạn cho ${processCode}.`);
}

function selectProcessItems(payload, config, processCodes) {
  const sourceGroup = payload?.groups?.[config.groupCode];
  if (!sourceGroup) throw new Error(`Backend thiếu dữ liệu ${config.groupCode}.`);
  return (sourceGroup.processes || []).filter((item) =>
    processCodes.includes(safeText(item?.process?.process_code).toUpperCase())
  );
}

function reportTimeKey(report) {
  return safeText(report.approved_at || report.created_at || report.entry_date || report.work_date);
}

function sortReports(reports) {
  return reports
    .filter(isValidReport)
    .sort((a, b) => dateKey(a.work_date).localeCompare(dateKey(b.work_date))
      || reportTimeKey(a).localeCompare(reportTimeKey(b))
      || safeText(a.worker_code).localeCompare(safeText(b.worker_code), undefined, { numeric: true })
      || safeText(a.machine_no).localeCompare(safeText(b.machine_no), undefined, { numeric: true })
      || Number(a.id) - Number(b.id));
}

function writeReportsIntoTemplateSheet({ sheet, layout, reports, deductionTypes, defectTypes }) {
  const blocks = findBlocks(sheet, layout);
  if (!blocks.length) throw new Error(`Không xác định được vùng dữ liệu của sheet ${sheet.name}.`);

  for (const block of blocks) clearBlock(sheet, block, layout);

  const reportsByDay = new Map();
  for (const report of reports) {
    const key = dateKey(report.work_date);
    const day = Number(key.slice(8, 10));
    if (!reportsByDay.has(day)) reportsByDay.set(day, []);
    reportsByDay.get(day).push(report);
  }

  // Mẫu báo cáo thật có thể bố trí theo từng ngày hoặc một vùng liên tục.
  // Khi có đủ block ngày, ghi đúng block của ngày. Nếu mẫu chỉ có một vùng,
  // ghi tuần tự nhưng vẫn giữ cột ngày của từng dòng.
  if (blocks.length >= 28) {
    for (const [day, dayReports] of reportsByDay) {
      const block = blocks[day - 1];
      if (!block) continue;
      const capacity = block.endRow - block.startRow + 1;
      if (dayReports.length > capacity) {
        throw new Error(`Ngày ${day} có ${dayReports.length} báo cáo, vượt ${capacity} dòng của sheet ${sheet.name}.`);
      }
      dayReports.forEach((report, index) => {
        writeRow(sheet, block.startRow + index, report, layout, deductionTypes, defectTypes, index + 1);
      });
    }
    return;
  }

  const detailBlock = blocks[0];
  const capacity = detailBlock.endRow - detailBlock.startRow + 1;
  if (reports.length > capacity) {
    throw new Error(`Có ${reports.length} báo cáo, vượt ${capacity} dòng của sheet ${sheet.name}.`);
  }
  let previousDate = '';
  let sequenceInDate = 0;
  reports.forEach((report, index) => {
    const currentDate = dateKey(report.work_date);
    sequenceInDate = currentDate !== previousDate ? 1 : sequenceInDate + 1;
    writeRow(sheet, detailBlock.startRow + index, report, layout, deductionTypes, defectTypes, sequenceInDate);
    previousDate = currentDate;
  });
}

async function buildProcessExcelLocal({ appPath, date, processCode, payload }) {
  const config = resolveProcessReportGroup(processCode);
  const [year, month] = safeText(date).split('-');
  const templatePath = path.join(appPath, 'assets', 'templates', config.template);
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Không tìm thấy file báo cáo mẫu: ${templatePath}`);
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(templatePath);
  materializeSharedFormulas(workbook);
  const periodReplacementCount = updateWorkbookPeriod(workbook, year, month);
  workbook.calcProperties.fullCalcOnLoad = true;
  workbook.calcProperties.forceFullCalc = true;
  workbook.calcProperties.calcMode = 'auto';

  let reportCount = 0;
  for (const sheetConfig of config.sheets) {
    const selected = selectProcessItems(payload, config, sheetConfig.processCodes);
    const reports = sortReports(selected.flatMap((item) => item.reports || []));
    reportCount += reports.length;

    const deductionTypes = uniqueBy(
      selected.flatMap((item) => item.deductionTypes || []),
      (item) => String(item.id || normalizeCode(item.deduction_code || item.code))
    );
    const defectTypes = uniqueBy(
      selected.flatMap((item) => item.defectTypes || []),
      (item) => String(item.id || normalizeCode(item.defect_code || item.code))
    );

    const sheet = workbook.getWorksheet(sheetConfig.sheetName);
    if (!sheet) throw new Error(`File báo cáo mẫu thiếu sheet ${sheetConfig.sheetName}.`);
    const layout = LAYOUTS[sheetConfig.layout];
    if (!layout) throw new Error(`Thiếu cấu hình bố cục ${sheetConfig.layout}.`);

    writeReportsIntoTemplateSheet({ sheet, layout, reports, deductionTypes, defectTypes });
  }

  let meta = workbook.getWorksheet('_KTC_META');
  if (!meta) meta = workbook.addWorksheet('_KTC_META');
  meta.state = 'veryHidden';
  meta.getCell('A6').value = 'EXPORT_KIND';
  meta.getCell('B6').value = 'PROCESS_REPORT_SAMPLE';
  meta.getCell('A7').value = 'PROCESS_GROUP';
  meta.getCell('B7').value = config.key;

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return {
    buffer,
    fileName: `Bao-cao-${config.slug}-${month}-${year}.xlsx`,
    processCode: config.processCode,
    processName: config.processName,
    reportGroup: config.key,
    reportCount,
    localBuild: true,
    sourcePath: templatePath,
    templateKind: 'PROCESS_REPORT_SAMPLE',
    targetSheets: config.sheets.map((item) => item.sheetName),
    requestedYearMonth: `${year}-${month}`,
    periodReplacementCount
  };
}

module.exports = { buildCompanyExcelLocal, buildProcessExcelLocal };
