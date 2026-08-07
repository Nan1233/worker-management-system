const fs = require('node:fs/promises');
const path = require('node:path');

function safePart(value, fallback = 'Cong doan') {
  return String(value || fallback)
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim() || fallback;
}

function safeFile(value, fallback) {
  const name = safePart(value, fallback);
  return name.toLowerCase().endsWith('.xlsx') ? name : `${name}.xlsx`;
}

function normalizeProcessCode(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '');
}

function normalizeProcessFolder({ processCode, processName, groupCode, groupTitle }) {
  const code = normalizeProcessCode(processCode || groupCode);
  if (['GC', 'CAT', 'LONG', 'GIA_CONG'].includes(code)) return 'Gia công';
  if (code === 'MAI_DO') return 'Mài - Đo';
  if (code === 'MAI') return 'Mài';
  if (code === 'DO') return 'Đo';
  if (code === 'K1') return 'Kiểm 1';
  if (code === 'K2') return 'Kiểm 2';
  if (code === 'EP') return 'Ép';
  if (code === 'CAN') return 'Cán';
  if (code === 'XLBV') return 'Xử lý bavia';
  return safePart(processName || groupTitle || code, 'Công đoạn');
}

function processReportFileName({ processCode, processName, month, year }) {
  const folder = normalizeProcessFolder({ processCode, processName });
  return safeFile(`Báo cáo ${folder} ${month}-${year}.xlsx`, `Bao-cao-${month}-${year}.xlsx`);
}

function assertDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) {
    throw new Error('Ngày đồng bộ Excel không hợp lệ');
  }
}

// A+B chỉ thuộc cấu trúc Năm -> Tháng.
async function getCompanyMonthTarget({ root, date, fileName }) {
  assertDate(date);
  const [year, month] = date.split('-');
  const folder = path.join(root, year, month);
  const normalizedFileName = safeFile(fileName, `A+B ${month}-${year}.xlsx`);
  await fs.mkdir(folder, { recursive: true });
  return {
    layout: 'YEAR_MONTH_COMPANY_FILE',
    folder,
    filePath: path.join(folder, normalizedFileName),
    fileName: normalizedFileName
  };
}

// Báo cáo công đoạn chỉ thuộc cấu trúc Năm -> Công đoạn -> file tháng.
async function getProcessMonthTarget({ root, date, processCode, processName, fileName }) {
  assertDate(date);
  const [year, month] = date.split('-');
  const processFolder = normalizeProcessFolder({ processCode, processName });
  const normalizedFileName = safeFile(
    fileName || processReportFileName({ processCode, processName, month, year }),
    `Bao-cao-${processFolder}-${month}-${year}.xlsx`
  );
  const folder = path.join(root, year, processFolder);
  await fs.mkdir(folder, { recursive: true });
  return {
    layout: 'YEAR_PROCESS_MONTH_FILE',
    folder,
    filePath: path.join(folder, normalizedFileName),
    fileName: normalizedFileName,
    processFolder
  };
}

module.exports = {
  getCompanyMonthTarget,
  getProcessMonthTarget,
  normalizeProcessFolder,
  processReportFileName,
  safeFile
};
