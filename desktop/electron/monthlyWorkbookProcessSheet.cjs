'use strict';
const { COLORS } = require('./monthlyWorkbookStyles.cjs');

function createProcessSheetRenderer({
  processDetailTypes, makeColumns, sortReports, settingsForReport, rowValues,
  setGroupHeader, groupStyle, achievementColor, applyCellStyle, applyAllBorders,
  asDate, asText, dateKey, headerFontSize, pad2, resolvedNumberFormat,
  solidFill, thinBorder,
}) {
function renderProcessSheet(workbook, code, processConfig, processData, yearMonth, formulaSettings) {
  const deductionTypes = processDetailTypes(code, processData, 'deductionTypes', 'deductions', 'deduction');
  const defectTypes = processDetailTypes(code, processData, 'defectTypes', 'defects', 'defect');
  const columns = makeColumns(code, deductionTypes, defectTypes);
  const reports = sortReports(processData?.reports);
  const settings = formulaSettings || {};
  const sheet = workbook.addWorksheet(processConfig.sheet, {
    views: [{
      state: 'frozen',
      xSplit: 4,
      ySplit: 5,
      topLeftCell: 'E6',
      activeCell: 'E6',
      showGridLines: false
    }]
  });
  sheet.properties.defaultRowHeight = 20;
  columns.forEach((column, index) => {
    const excelColumn = sheet.getColumn(index + 1);
    excelColumn.hidden = false;
    excelColumn.outlineLevel = 0;
    excelColumn.width = Math.max(5, Number(column.width) || 8);
  });
  const lastColumn = columns.length;

  sheet.mergeCells(1, 1, 2, lastColumn);
  sheet.getCell(1, 1).value = `BÁO CÁO SẢN XUẤT CÔNG ĐOẠN ${processConfig.title}`;
  applyCellStyle(sheet.getCell(1, 1), { fill: COLORS.navy, fontColor: COLORS.white, bold: true, size: 18, border: false });
  sheet.mergeCells(3, 1, 3, lastColumn);
  const [year, month] = yearMonth.split('-');
  sheet.getCell(3, 1).value = `Tháng ${month}/${year} • Nguồn: TiDB - báo cáo đã duyệt`;
  applyCellStyle(sheet.getCell(3, 1), { fill: COLORS.blueLight, fontColor: COLORS.navy, bold: true, size: 11, border: false });

  setGroupHeader(sheet, columns, processConfig);
  columns.forEach((column, index) => {
    const cell = sheet.getCell(5, index + 1);
    const style = groupStyle(column.group);
    const headerText = asText(column.header) || column.key;

    // Rule tháng 07/2026: header cột nền xanh đậm, chữ trắng, đồng nhất toàn bảng.
    cell.value = headerText;
    cell.numFmt = '@';
    cell.font = {
      name: 'Arial',
      size: headerFontSize(headerText),
      bold: true,
      color: { argb: COLORS.white }
    };
    cell.fill = solidFill(COLORS.blue);
    cell.border = thinBorder();
    cell.alignment = {
      horizontal: 'center',
      vertical: 'middle',
      wrapText: true,
      shrinkToFit: false,
      textRotation: 0
    };
    cell.protection = { locked: true, hidden: false };

    const excelColumn = sheet.getColumn(index + 1);
    excelColumn.hidden = false;
    excelColumn.outlineLevel = 0;
  });
  sheet.getRow(4).height = 22;
  sheet.getRow(5).height = 38;
  sheet.getRow(5).hidden = false;
  sheet.getRow(5).outlineLevel = 0;

  const dataStartRow = 6;
  const numericTotals = new Array(columns.length).fill(0);
  let currentRowNumber = dataStartRow;
  let previousDate = null;
  let sequenceInDate = 0;

  reports.forEach((report, reportIndex) => {
    const currentDate = dateKey(report.work_date);

    // Mỗi ngày bắt đầu bằng đúng một hàng phân cách. Ô A của hàng này
    // ghi ngày báo cáo được chọn trên form (work_date). Không tạo thêm
    // hàng trống riêng và không lặp ngày trên từng dòng dữ liệu.
    if (currentDate !== previousDate) {
      const dateRow = sheet.getRow(currentRowNumber);
      dateRow.height = 22;
      dateRow.hidden = false;
      dateRow.outlineLevel = 0;

      for (let col = 1; col <= lastColumn; col += 1) {
        const cell = dateRow.getCell(col);
        cell.value = null;
        cell.fill = solidFill(col <= 4 ? COLORS.blueLight : COLORS.white);
        cell.border = thinBorder();
      }

      // Chỉ gộp A:D trên hàng phân cách ngày. Các dòng dữ liệu phía dưới
      // vẫn giữ cột A là STT, B là thời gian nhập, C là mã NV và D là tên NV.
      sheet.mergeCells(currentRowNumber, 1, currentRowNumber, 4);

      const reportDate = asDate(report.work_date);
      const dateCell = dateRow.getCell(1);
      dateCell.value = reportDate
        ? `${pad2(reportDate.getDate())}/${pad2(reportDate.getMonth() + 1)}/${reportDate.getFullYear()}`
        : asText(report.work_date);
      dateCell.numFmt = '@';
      applyCellStyle(dateCell, {
        fill: COLORS.blueLight,
        fontColor: COLORS.navy,
        bold: true,
        size: 10,
        align: 'left'
      });
      dateCell.alignment = {
        horizontal: 'left',
        vertical: 'middle',
        indent: 1
      };

      currentRowNumber += 1;
      sequenceInDate = 0;
    }

    sequenceInDate += 1;
    const rowNumber = currentRowNumber;
    const reportSettings = settingsForReport(report, settings, processData?.formulaSettingsByDate || {});
    const values = rowValues(code, report, deductionTypes, defectTypes, reportSettings);
    values.stt = sequenceInDate;

    columns.forEach((column, columnIndex) => {
      const cell = sheet.getCell(rowNumber, columnIndex + 1);
      const value = values[column.key];
      cell.value = value === undefined ? null : value;
      if (column.format) cell.numFmt = resolvedNumberFormat(value, column.format);
      const numericValue = typeof value === 'number' && Number.isFinite(value) ? value : null;
      // Rule tháng 07/2026: nền dữ liệu mặc định trắng, không zebra/rainbow.
      // Chỉ các chỉ số tổng hợp chính mới có màu cố định; chi tiết trừ giờ/NG luôn nền trắng.
      let fill = COLORS.white;
      let bold = false;
      let fontColor = COLORS.black;
      const machineMode = asText(report.operation_mode).toUpperCase() === 'MACHINE';
      const editableCore = machineMode
        ? new Set(['training','note'])
        : new Set(['shift','machine','product','training','actualTime','ok','note']);
      const editableCell = editableCore.has(column.key) || (!machineMode && (column.key.startsWith('deduction:') || column.key.startsWith('defect:')));

      if (column.key === 'workingTime' || column.key === 'outputPerHour') fill = COLORS.blueLight;
      else if (column.key === 'deductionTime') fill = COLORS.orangeLight;
      else if (column.key === 'actualTime' || column.key === 'ok') fill = COLORS.greenLight;
      else if (column.key === 'output' || column.key === 'enteredOutput') fill = COLORS.actualOutput;
      else if (column.key === 'ng') fill = COLORS.redLight;

      if (column.group === 'deduction' || column.group === 'defect') {
        fill = COLORS.white;
        bold = numericValue !== null && numericValue > 0;
        fontColor = COLORS.black;
      }

      applyCellStyle(cell, {
        fill,
        fontColor,
        bold,
        size: 8,
        align: column.align || (typeof value === 'number' ? 'right' : 'center'),
        wrap: Boolean(column.wide),
        shrink: false
      });
      if (editableCell) cell.protection = { locked: false, hidden: false };

      if (column.key === 'achievement') {
        const achievementFill = achievementColor(value, reportSettings);
        if (achievementFill) cell.fill = solidFill(achievementFill);
        cell.font = { ...cell.font, color: { argb: COLORS.black }, bold: true };
      } else if (column.key === 'ngRate') {
        const rate = Number(value);
        if (Number.isFinite(rate)) {
          cell.fill = solidFill(rate <= 0.01 ? COLORS.rateGood : rate <= 0.03 ? COLORS.rateWarning : COLORS.rateBad);
          cell.font = { ...cell.font, color: { argb: COLORS.black }, bold: true };
        }
      } else if (column.key === 'status' && asText(value).toLowerCase() === 'approved') {
        // Trạng thái giữ nền trắng để không tạo thêm mảng màu rời rạc.
        cell.font = { ...cell.font, color: { argb: COLORS.black }, bold: true };
      }

      if (typeof value === 'number' && Number.isFinite(value)) numericTotals[columnIndex] += value;
    });

    previousDate = currentDate;
    currentRowNumber += 1;
  });

  const totalRowNumber = currentRowNumber;
  const totalLabelEnd = Math.min(10, lastColumn);
  if (totalLabelEnd > 1) sheet.mergeCells(totalRowNumber, 1, totalRowNumber, totalLabelEnd);
  const totalLabel = sheet.getCell(totalRowNumber, 1);
  totalLabel.value = 'TỔNG CỘNG';
  applyCellStyle(totalLabel, { fill: COLORS.navy, fontColor: COLORS.white, bold: true, size: 11, align: 'left' });
  for (let col = 2; col <= totalLabelEnd; col += 1) {
    sheet.getCell(totalRowNumber, col).fill = solidFill(COLORS.navy);
    sheet.getCell(totalRowNumber, col).border = thinBorder();
  }
  const nonTotalKeys = new Set(['stt','entryDate','workerCode','workerName','shift','operationType','operationMode','machine','product','training','standard','outputPerHour','achievement','ngRate','status','note','id']);
  columns.forEach((column, index) => {
    if (index + 1 <= totalLabelEnd) return;
    const cell = sheet.getCell(totalRowNumber, index + 1);
    const value = nonTotalKeys.has(column.key) ? null : numericTotals[index];
    cell.value = value;
    if (column.format) cell.numFmt = resolvedNumberFormat(value, column.format);
    applyCellStyle(cell, { fill: COLORS.navy, fontColor: COLORS.white, bold: true, align: 'right' });
  });
  sheet.getRow(totalRowNumber).height = 24;
  sheet.autoFilter = { from: { row: 5, column: 1 }, to: { row: Math.max(5, totalRowNumber - 1), column: lastColumn } };
  sheet.pageSetup = {
    orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9,
    margins: { left: 0.2, right: 0.2, top: 0.4, bottom: 0.4, header: 0.15, footer: 0.15 }
  };
  sheet.headerFooter = { oddFooter: '&LKTC Production Control&CTrang &P / &N&R&D &T' };
  // All Borders cho toàn bộ vùng bảng: header nhóm, header cột, hàng ngày, dữ liệu và tổng cộng.
  applyAllBorders(sheet, { fromRow: 4, toRow: totalRowNumber, fromCol: 1, toCol: lastColumn });
  return { code, sheet: processConfig.sheet, reportCount: reports.length, deductionColumnCount: deductionTypes.length, defectColumnCount: defectTypes.length };
}


  return { renderProcessSheet };
}

module.exports = { createProcessSheetRenderer };
