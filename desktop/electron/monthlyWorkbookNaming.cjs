'use strict';

// Pure workbook naming policy. Kept separate from ExcelJS template rendering
// so filenames can be regression-tested without touching production workbooks.
// Tên file cố định để thư mục tháng luôn sắp xếp đúng thứ tự công đoạn.
// Không dùng dấu tiếng Việt trong tên file để tránh lỗi đường dẫn ở Excel/Windows cũ.
const { PROCESS_FILE_PREFIXES, normalizeYearMonth } = require('./monthlyExcelContract.cjs');
function monthlyFileSuffix(date,payload) {
  const [year,month]=normalizeYearMonth(payload?.yearMonth||date).split('-');
  return `${month}-${year}`;
}

function processWorkbookFileName(processCode, date, payload) {
  const prefix = PROCESS_FILE_PREFIXES[processCode];
  if (!prefix) throw new Error(`Công đoạn không hỗ trợ xuất file riêng: ${processCode}`);
  return `${prefix}_${monthlyFileSuffix(date, payload)}.xlsx`;
}

function summaryWorkbookFileName(date, payload) {
  return `00_TONG_HOP_SAN_XUAT_${monthlyFileSuffix(date, payload)}.xlsx`;
}

module.exports = {
  PROCESS_FILE_PREFIXES,
  monthlyFileSuffix,
  processWorkbookFileName,
  summaryWorkbookFileName,
};
