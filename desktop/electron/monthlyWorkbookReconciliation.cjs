'use strict';
const ExcelJS = require('exceljs');
const { PROCESS_SHEETS } = require('./monthlyWorkbookSchemas.cjs');
const { COLORS } = require('./monthlyWorkbookStyles.cjs');
const { NUMBER_FORMATS, resolvedNumberFormat } = require('./monthlyWorkbookValues.cjs');
const { applyCellStyle, applyAllBorders } = require('./monthlyWorkbookCellStyles.cjs');
const {
  assertApprovedDatabasePayload, formulaSettingsFor, sortReports,
  settingsForReport, reportSnapshot,
} = require('./monthlyWorkbookReportData.cjs');

async function buildReconciliationWorkbook({ date, payload }) {
  assertApprovedDatabasePayload(payload);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'KTC Production Control';
  const sheet = workbook.addWorksheet('DATA_DB', { views: [{ state: 'frozen', ySplit: 1 }] });
  const headers = ['Công đoạn','ID','Ngày báo cáo','Ngày nhập','Mã NV','Tên NV','Ca','Máy','Mã SP','% học việc','Định mức','Tổng thời gian','Thời gian thực tế','Tổng thời gian trừ','OK','NG','SP công nhân nhập','Tổng SP quy đổi','Trừ giờ JSON','NG JSON','Máy JSON','Trạng thái','Ghi chú'];
  sheet.addRow(headers);
  headers.forEach((_, index) => {
    applyCellStyle(sheet.getCell(1, index + 1), { fill: COLORS.navy, fontColor: COLORS.white, bold: true });
    sheet.getColumn(index + 1).width = index >= 18 && index <= 20 ? 35 : [20,10,13,13,11,24,7,18,18,11,12,12,12,12,10,10,14,14][index] || 14;
  });
  let count = 0;
  for (const [code, config] of Object.entries(PROCESS_SHEETS)) {
    const processData = payload.processes?.[code] || {};
    const baseSettings = formulaSettingsFor(payload, code);
    for (const report of sortReports(processData.reports)) {
      const itemSettings = settingsForReport(report, baseSettings, processData.formulaSettingsByDate || {});
      const value = reportSnapshot(report, itemSettings);
      const row = sheet.addRow([config.title,value.id,value.date,value.entryDate,value.workerCode,value.workerName,value.shift,value.machine,value.product,value.training,value.standard,value.workingTime,value.actualTime,value.deductionTime,value.ok,value.ng,value.enteredOutput,value.output,JSON.stringify(report.deductions || []),JSON.stringify(report.defects || []),JSON.stringify(report.machineLines || []),report.status,value.note]);
      row.getCell(2).numFmt = NUMBER_FORMATS.INTEGER;
      row.getCell(3).numFmt = NUMBER_FORMATS.DATE;
      row.getCell(4).numFmt = NUMBER_FORMATS.DATE;
      row.getCell(10).numFmt = NUMBER_FORMATS.PERCENT;
      row.getCell(11).numFmt = resolvedNumberFormat(value.standard, NUMBER_FORMATS.RATE);
      row.getCell(12).numFmt = resolvedNumberFormat(value.workingTime, NUMBER_FORMATS.DECIMAL);
      row.getCell(13).numFmt = resolvedNumberFormat(value.actualTime, NUMBER_FORMATS.DECIMAL);
      row.getCell(14).numFmt = resolvedNumberFormat(value.deductionTime, NUMBER_FORMATS.DECIMAL);
      row.getCell(15).numFmt = NUMBER_FORMATS.INTEGER;
      row.getCell(16).numFmt = NUMBER_FORMATS.INTEGER;
      row.getCell(17).numFmt = NUMBER_FORMATS.INTEGER;
      row.getCell(18).numFmt = NUMBER_FORMATS.INTEGER;
      row.eachCell((cell, column) => applyCellStyle(cell, { fill: count % 2 ? COLORS.blueLight : COLORS.white, align: [1,6,8,9,19,20,21,23].includes(column) ? 'left' : 'center' }));
      count += 1;
    }
  }
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, count + 1), column: headers.length } };
  applyAllBorders(sheet, { fromRow: 1, toRow: Math.max(1, count + 1), fromCol: 1, toCol: headers.length });
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return { buffer, rowCount: count };
}

module.exports = { buildReconciliationWorkbook };
