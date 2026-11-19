'use strict';

// Pure workbook naming policy. Kept separate from ExcelJS template rendering
// so filenames can be regression-tested without touching production workbooks.
// Tên file cố định để thư mục tháng luôn sắp xếp đúng thứ tự công đoạn.
// Không dùng dấu tiếng Việt trong tên file để tránh lỗi đường dẫn ở Excel/Windows cũ.
const PROCESS_FILE_PREFIXES = Object.freeze({
  CAN: '01_CAN',
  EP: '02_EP',
  XLBV: '03_XU_LY_BAVIA',
  GC: '04_CAT_LONG',
  MAI: '05_MAI',
  DO: '06_DO',
  K1: '07_KIEM_1',
  K2: '08_KIEM_2',
  SX3: '09_SAN_XUAT_3',
  CVK: '10_CONG_VIEC_KHAC'
});

function monthlyFileSuffix(date, payload) {
  const yearMonth = String(payload?.yearMonth || date || '').slice(0, 7);
  const [year, month] = yearMonth.split('-');
  if (!/^\d{4}$/.test(year || '') || !/^\d{2}$/.test(month || '')) {
    throw new Error(`Tháng xuất Excel không hợp lệ: ${yearMonth}`);
  }
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
