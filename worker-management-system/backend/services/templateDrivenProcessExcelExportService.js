'use strict';

const ExcelJS = require('exceljs');
const fs = require('node:fs/promises');
const path = require('node:path');
const {
  resolveTemplatePath,
  getProcessTemplateContract,
  normalizeLabel
} = require('./excelTemplateContractService');

const alias = (value) => normalizeLabel(value);

const has = (label, ...parts) => parts.some((part) => label.includes(alias(part)));

function findColumnMap(sheet, headerRow) {
  const map = new Map();
  for (let c = 1; c <= sheet.columnCount; c += 1) {
    const raw = sheet.getRow(headerRow).getCell(c).value;
    const label = alias(typeof raw === 'object' && raw?.result != null ? raw.result : raw);
    if (label) map.set(c, label);
  }
  return map;
}

function pickColumn(columnMap, predicates) {
  for (const [column, label] of columnMap.entries()) {
    if (predicates.every((predicate) => predicate(label))) return column;
  }
  return null;
}

function processColumns(sheet, contract, processCode) {
  const map = findColumnMap(sheet, contract.headerRow);
  const find = (...patterns) => pickColumn(map, patterns.map((p) => (label) => label.includes(alias(p))));
  const cols = {
    workerCode: find('mã số cn') || find('mã nhân viên') || find('mã số'),
    workerName: find('họ tên') || find('họ & tên') || find('tên') || find('người'),
    shift: find('ca'),
    machine: find('số máy') || find('máy đo') || find('máy mài') || find('máy'),
    product: find('mã sản phẩm') || find('mã số sản phẩm') || find('mã sp'),
    workDate: find('ngày sản xuất') || find('ngày/tháng') || find('ngày tháng') || find('ngày'),
    training: find('% học việc'),
    standard: find('định mức') || find('kh'),
    actual: find('thực tích') || find('kqsx') || find('kết quả sản xuất') || find('tt'),
    ok: find('sản phẩm ok') || find('sl ok') || find('ok'),
    ng: find('tổng ng') || find('tổng lỗi') || find('tổng pp'),
    achievement: find('% năng suất') || find('% thực tích') || find('% sản lượng theo kế hoạch') || find('%'),
    totalTime: null,
    actualTime: null
  };

  const timeCandidates = [];
  for (const [column, label] of map.entries()) {
    if (label.includes('thời gian') || label === 'thời gian') timeCandidates.push(column);
  }

  const timeRules = {
    CAN: [6],
    EP: [7],
    XLBV: [11],
    GC: [7, 8],
    MAI: [9, 10],
    DO: [8, 9],
    K1: [14],
    K2: [22, 23],
    SX3: [8, 9]
  };
  const preferred = timeRules[processCode] || [];
  cols.totalTime = preferred[0] || timeCandidates[0] || null;
  cols.actualTime = preferred[1] || timeCandidates[1] || cols.totalTime;

  return { map, cols };
}

function rawValue(report, key) {
  const value = report?.[key];
  if (value !== undefined && value !== null) return value;
  const extra = report?.extra_data;
  if (!extra) return null;
  try {
    const parsed = typeof extra === 'string' ? JSON.parse(extra) : extra;
    return parsed?.[key] ?? null;
  } catch (_) {
    return null;
  }
}

function asDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function metric(report, key) {
  if (key === 'actual_output') return Number(report?.actual_output ?? 0);
  if (key === 'standard_output') return Number(report?.standard_output ?? 0);
  if (key === 'tt_ok') return Number(report?.tt_ok ?? 0);
  if (key === 'tt_ng') return Number(report?.tt_ng ?? 0);
  if (key === 'achievement_rate') {
    const standard = Number(report?.standard_output ?? 0);
    const actual = Number(report?.actual_output ?? 0);
    const time = Number(report?.actual_time ?? report?.total_time ?? 0);
    return standard > 0 && time > 0 ? actual / (standard * time) : 0;
  }
  return Number(report?.[key] ?? 0);
}

function writeDefectsAndDeductions(row, report, columnMap) {
  const defects = Array.isArray(report?.defects) ? report.defects : [];
  const deductions = Array.isArray(report?.deductions) ? report.deductions : [];

  for (const [column, label] of columnMap.entries()) {
    const normalized = alias(label);
    const defect = defects.find((item) =>
      alias(item?.defect_name || item?.name || item?.defect_code).includes(normalized) ||
      normalized.includes(alias(item?.defect_name || item?.name || item?.defect_code))
    );
    if (defect) {
      row.getCell(column).value = Number(defect.quantity ?? defect.count ?? defect.value ?? 0);
      continue;
    }
    const deduction = deductions.find((item) =>
      alias(item?.deduction_name || item?.name || item?.deduction_code).includes(normalized) ||
      normalized.includes(alias(item?.deduction_name || item?.name || item?.deduction_code))
    );
    if (deduction) {
      row.getCell(column).value = Number(deduction.hours ?? deduction.time ?? deduction.value ?? 0);
    }
  }
}

function writeReportRow(sheet, rowNumber, report, processCode, mapping) {
  const row = sheet.getRow(rowNumber);
  const c = mapping.cols;
  const set = (column, value) => {
    if (!column) return;
    row.getCell(column).value = value == null ? null : value;
  };

  set(c.workerCode, report.worker_code);
  set(c.workerName, report.full_name || report.worker_name);
  set(c.shift, report.shift);
  set(c.machine, report.machine_no);
  set(c.product, report.product_name || rawValue(report, 'product_code'));
  set(c.workDate, asDate(report.work_date));
  set(c.training, report.training_percent);
  set(c.standard, metric(report, 'standard_output'));
  set(c.actual, metric(report, 'actual_output'));
  set(c.ok, metric(report, 'tt_ok'));
  set(c.ng, metric(report, 'tt_ng'));
  set(c.achievement, metric(report, 'achievement_rate'));
  set(c.totalTime, metric(report, 'total_time'));
  if (c.actualTime && c.actualTime !== c.totalTime) set(c.actualTime, metric(report, 'actual_time'));

  writeDefectsAndDeductions(row, report, mapping.map);
}

function clearBrokenAndExternalFormulas(workbook) {
  let removed = 0;
  workbook.eachSheet((sheet) => {
    sheet.eachRow((row) => {
      row.eachCell((cell) => {
        if (typeof cell.value === 'string' && cell.value.startsWith('=')) {
          if (cell.value.includes('#REF!') || /\[[^\]]+\][^!]+!/.test(cell.value)) {
            cell.value = null;
            removed += 1;
          }
        }
      });
    });
  });
  return removed;
}

function clearDetailConstants(sheet, startRow, endRow) {
  for (let r = startRow; r <= endRow; r += 1) {
    const row = sheet.getRow(r);
    for (let c = 1; c <= sheet.columnCount; c += 1) {
      const cell = row.getCell(c);
      if (typeof cell.value !== 'string' || !cell.value.startsWith('=')) cell.value = null;
    }
  }
}

async function buildTemplateDrivenProcessWorkbook(reports, yearMonth, options = {}) {
  const processCode = String(reports?.[0]?.process_code || options.processCode || '').toUpperCase();
  const contract = getProcessTemplateContract(processCode);
  const templatePath = await resolveTemplatePath();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(templatePath);

  const sheet = workbook.getWorksheet(contract.sheet);
  if (!sheet) {
    throw Object.assign(new Error(`File mẫu thiếu sheet ${contract.sheet}`), {
      code: 'KTC_EXCEL_TEMPLATE_SHEET_MISSING',
      statusCode: 500
    });
  }

  if ((reports?.length || 0) > contract.dataEndRow - contract.dataStartRow + 1) {
    throw Object.assign(
      new Error(`File mẫu ${contract.sheet} chỉ có ${contract.dataEndRow - contract.dataStartRow + 1} dòng chi tiết; tháng ${yearMonth} có ${reports.length} báo cáo`),
      { code: 'KTC_EXCEL_TEMPLATE_CAPACITY_EXCEEDED', statusCode: 422 }
    );
  }

  const mapping = processColumns(sheet, contract, processCode);
  clearDetailConstants(sheet, contract.dataStartRow, contract.dataEndRow);

  for (let index = 0; index < (reports || []).length; index += 1) {
    writeReportRow(sheet, contract.dataStartRow + index, reports[index], processCode, mapping);
  }

  // Các formula #REF!/external-workbook cũ trong file mẫu không được phép đi
  // vào file xuất vì tạo lỗi hoặc popup liên kết ngoài. Layout/style/sheet vẫn
  // giữ nguyên; chỉ công thức hỏng/ngoài workbook bị bỏ.
  const removedBrokenFormulas = clearBrokenAndExternalFormulas(workbook);
  workbook.calculation = { fullCalcOnLoad: true, forceFullCalc: true, calcMode: 'auto' };

  const exportRoot = options.exportRoot || path.join(process.cwd(), 'exports-process');
  const [year, month] = String(yearMonth).split('-');
  const folder = path.join(exportRoot, year, options.processName || processCode, month);
  await fs.mkdir(folder, { recursive: true });
  const fileName = options.fileName || `Bao-cao-${processCode}-${month}-${year}.xlsx`;
  const outputPath = path.join(folder, fileName);
  await workbook.xlsx.writeFile(outputPath);

  return {
    archivePath: outputPath,
    fileName,
    processCode,
    templateFile: path.basename(templatePath),
    templateSheet: contract.sheet,
    templateHeaderRow: contract.headerRow,
    dataStartRow: contract.dataStartRow,
    reportCount: reports.length,
    removedBrokenFormulas
  };
}

module.exports = { buildTemplateDrivenProcessWorkbook };
