const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const ExcelJS = require('exceljs');

const { GROUPS, LAYOUTS } = require('./companyExcelLayouts.cjs');

const {safeText,num,reportExtraValue,normalizeCode,dateKey,toExcelDate,isFormulaValue,setCell,uniqueBy} = require('./companyExcelCellValues.cjs');

function reportGrindingSeconds(report) {
  const lines = getMachineLines(report);
  const lineValue = lines.find((line) => line?.standard_time_seconds != null)?.standard_time_seconds;
  const value = report?.standard_time_seconds ?? lineValue ?? reportExtraValue(report, 'standard_time_seconds');
  return value === '' || value == null ? null : num(value);
}

const { createCompanyExcelTemplateAdapter } = require('./companyExcelTemplateAdapter.cjs');
const { findBlocks, normalizeAbsoluteRelationshipTargets, materializeSharedFormulas } =
  createCompanyExcelTemplateAdapter({ safeText });

const { createCompanyExcelPeriod } = require('./companyExcelPeriod.cjs');
const { updateWorkbookPeriod, assertWorkbookPeriod } = createCompanyExcelPeriod({ safeText });

function clearReportRow(row, lastColumn) {
  for (let column = 1; column <= lastColumn; column += 1) {
    const cell = row.getCell(column);
    const value = cell.value;
    // Template formulas (including shared/array formulas) are part of the
    // original workbook contract. Clear only input cells; never erase formulas.
    if (isFormulaValue(value)) continue;
    cell.value = null;
  }
}

function clearBlock(sheet, block, layout) {
  for (let rowNumber = block.startRow; rowNumber <= block.endRow; rowNumber += 1) {
    // Keep the template's original row visibility and formatting unchanged.
    clearReportRow(sheet.getRow(rowNumber), layout.lastReportColumn);
  }
}

const { createCompanyExcelMetrics } = require('./companyExcelMetrics.cjs');
const { getMetrics } = createCompanyExcelMetrics({ num, normalizeCode, safeText });

function writeDetailColumns(row, report, layout, deductionTypes, defectTypes) {
  if (layout.deductionCodeColumns) {
    const totalsByColumn = new Map();
    for (const item of report.deductions || []) {
      const code = normalizeCode(item.deduction_type_code || item.deduction_code || item.code || item.deduction_name);
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
      const code = normalizeCode(item.defect_type_code || item.defect_code || item.code || item.defect_name);
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

  clearReportRow(row, layout.lastReportColumn);

  setCell(row, fixed.sequence, sequence, '0');
  setCell(row, fixed.workerCode, safeText(report.worker_code));
  setCell(row, fixed.workerName, safeText(
    report.full_name || report.worker_name || report.worker_full_name || report.user_full_name
  ));
  setCell(row, fixed.machine, getMachineText(report));
  if (layout === LAYOUTS.MAI) {
    setCell(row, fixed.grindingSeconds, reportGrindingSeconds(report), '0.00');
  }
  if (layout === LAYOUTS.DO) {
    setCell(row, fixed.relatedGrindingMachine, reportExtraValue(report, 'grinding_machine_no'));
  }
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
  const templateCandidates = [
    process.resourcesPath ? path.join(process.resourcesPath, 'templates', group.template) : '',
    path.join(appPath, 'assets', 'templates', group.template),
    path.resolve(__dirname, '..', 'assets', 'templates', group.template),
    path.resolve(__dirname, '..', '..', 'backend', 'templates', group.template)
  ].filter(Boolean);
  const templatePath = templateCandidates.find((candidate) => fs.existsSync(candidate));
  if (!templatePath) {
    throw new Error(`Không tìm thấy template Excel công ty ${group.template}. Đã kiểm tra: ${templateCandidates.join(' | ')}`);
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
    groupCode: 'GIA_CONG', processCodes: ['GC'], template: 'bao-cao-cat-long-export.xlsx',
    sheets: [{ processCodes: ['GC'], sheetName: 'Cắt lồng', layout: 'GIA_CONG' }],
    fileName: ({ month, year }) => `04_CAT_LONG_${month}-${year}.xlsx`
  },
  MAI: {
    key: 'MAI', processCode: 'MAI', processName: 'Mài', slug: 'Mai',
    groupCode: 'MAI_DO', processCodes: ['MAI'], template: 'TT_MAI_TEMPLATE.xlsx',
    sheets: [{ processCodes: ['MAI'], sheetName: 'TT Mài', layout: 'MAI' }],
    fileName: ({ month, year }) => `05_MAI_${month}-${year}.xlsx`
  },
  DO: {
    key: 'DO', processCode: 'DO', processName: 'Đo', slug: 'Do',
    groupCode: 'MAI_DO', processCodes: ['DO'], template: 'TT_DO_TEMPLATE.xlsx',
    sheets: [{ processCodes: ['DO'], sheetName: 'TT Đo', layout: 'DO' }],
    fileName: ({ month, year }) => `06_DO_${month}-${year}.xlsx`
  }
});

function resolveProcessReportGroup(processCode) {
  const code = safeText(processCode).toUpperCase();
  if (code === 'GC') return PROCESS_REPORT_GROUPS.GC;
  if (code === 'MAI') return PROCESS_REPORT_GROUPS.MAI;
  if (code === 'DO') return PROCESS_REPORT_GROUPS.DO;
  throw new Error(`Chưa có mẫu báo cáo công đoạn cho ${processCode}.`);
}

function assertDistinctMaiDoTemplates(templatePath, config) {
  if (!['MAI', 'DO'].includes(config.key)) return;
  const counterpart = PROCESS_REPORT_GROUPS[config.key === 'MAI' ? 'DO' : 'MAI'];
  const counterpartPath = path.join(path.dirname(templatePath), counterpart.template);
  if (!fs.existsSync(counterpartPath)) {
    throw new Error(`Thiếu template riêng của công đoạn ${counterpart.processName}: ${counterpart.template}`);
  }
  const currentHash = crypto.createHash('sha256').update(fs.readFileSync(templatePath)).digest('hex');
  const counterpartHash = crypto.createHash('sha256').update(fs.readFileSync(counterpartPath)).digest('hex');
  if (currentHash === counterpartHash) {
    throw new Error('Template Mài và Đo đang trùng nội dung. Không xuất báo cáo để tránh áp dụng sai màu sắc/định dạng của công đoạn.');
  }
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
  const templateCandidates = [
    process.resourcesPath ? path.join(process.resourcesPath, 'templates', config.template) : '',
    path.join(appPath, 'assets', 'templates', config.template),
    path.resolve(__dirname, '..', 'assets', 'templates', config.template),
    path.resolve(__dirname, '..', '..', 'backend', 'templates', config.template)
  ].filter(Boolean);
  const existingCandidates = [...new Set(templateCandidates)].filter((candidate) => fs.existsSync(candidate));
  if (!existingCandidates.length) {
    throw new Error(`Không tìm thấy file báo cáo mẫu ${config.template}. Đã kiểm tra: ${templateCandidates.join(' | ')}`);
  }

  // A stale packaged copy can have the same filename but be a completely
  // different workbook. Accept a candidate only if its required process sheet
  // and date-block structure match the selected process layout.
  let templatePath = '';
  let workbook = null;
  const rejectedCandidates = [];
  for (const candidate of existingCandidates) {
    try {
      const candidateWorkbook = new ExcelJS.Workbook();
      const sourceBuffer = fs.readFileSync(candidate);
      const compatibleBuffer = await normalizeAbsoluteRelationshipTargets(sourceBuffer);
      await candidateWorkbook.xlsx.load(compatibleBuffer);
      materializeSharedFormulas(candidateWorkbook);
      const candidateSheet = candidateWorkbook.getWorksheet(config.sheets[0].sheetName);
      if (!candidateSheet) throw new Error(`thiếu sheet ${config.sheets[0].sheetName}`);
      const candidateLayout = LAYOUTS[config.sheets[0].layout];
      const candidateBlocks = findBlocks(candidateSheet, candidateLayout);
      if (!candidateBlocks.length) throw new Error('không nhận diện được vùng dữ liệu');
      templatePath = candidate;
      workbook = candidateWorkbook;
      break;
    } catch (error) {
      rejectedCandidates.push(`${candidate}: ${error.message}`);
    }
  }
  if (!workbook || !templatePath) {
    throw new Error(`Không tìm được template ${config.template} đúng cấu trúc ${config.sheets[0].sheetName}. ${rejectedCandidates.join(' | ')}`);
  }

  assertDistinctMaiDoTemplates(templatePath, config);
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

  // Preserve every source worksheet's original visibility/state. Only the
  // matching process sheet receives data; do not mutate the workbook structure.
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return {
    buffer,
    fileName: config.fileName({ month, year }),
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

module.exports = { buildCompanyExcelLocal, buildProcessExcelLocal, _private: { getMetrics, normalizeAbsoluteRelationshipTargets } };
