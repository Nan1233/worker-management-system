'use strict';
const { COLORS } = require('./monthlyWorkbookStyles.cjs');
const { applyCellStyle } = require('./monthlyWorkbookCellStyles.cjs');

function addCover(workbook, yearMonth, diagnostics) {
  const [year, month] = yearMonth.split('-');
  const sheet = workbook.addWorksheet('BÌA', { views: [{ showGridLines: false }] });
  sheet.columns = Array.from({ length: 12 }, () => ({ width: 12 }));
  sheet.mergeCells('B3:L5');
  sheet.getCell('B3').value = 'BÁO CÁO SẢN XUẤT THÁNG';
  applyCellStyle(sheet.getCell('B3'), { fill: COLORS.navy, fontColor: COLORS.white, bold: true, size: 22, border: false });
  sheet.mergeCells('B6:L7');
  sheet.getCell('B6').value = `THÁNG ${month}/${year}`;
  applyCellStyle(sheet.getCell('B6'), { fill: COLORS.blue, fontColor: COLORS.white, bold: true, size: 18, border: false });

  const totalReports = Object.values(diagnostics || {}).reduce((sum, item) => sum + Number(item?.reports || 0), 0);
  const activeProcesses = Object.values(diagnostics || {}).filter((item) => Number(item?.reports || 0) > 0).length;
  const info = [
    ['Nguồn dữ liệu', 'TiDB - production_reports đã duyệt'],
    ['Số báo cáo', totalReports],
    ['Công đoạn có dữ liệu', `${activeProcesses}/9`],
    ['Ngày tạo file', new Date()]
  ];
  info.forEach(([label, value], index) => {
    const row = 10 + index;
    sheet.mergeCells(row, 3, row, 5);
    sheet.mergeCells(row, 6, row, 10);
    sheet.getCell(row, 3).value = label;
    sheet.getCell(row, 6).value = value;
    applyCellStyle(sheet.getCell(row, 3), { fill: COLORS.blueLight, bold: true, align: 'left' });
    applyCellStyle(sheet.getCell(row, 6), { fill: COLORS.white, align: 'left' });
    if (value instanceof Date) sheet.getCell(row, 6).numFmt = 'dd/mm/yyyy hh:mm';
  });
  sheet.mergeCells('C16:J18');
  sheet.getCell('C16').value = 'File được tạo tự động từ dữ liệu quản lý đã duyệt. Không sử dụng dữ liệu minh họa trong file mẫu.';
  applyCellStyle(sheet.getCell('C16'), { fill: COLORS.grayLight, bold: false, align: 'center', border: false });
  sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1, margins: { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };
  return sheet;
}

module.exports = { addCover };
