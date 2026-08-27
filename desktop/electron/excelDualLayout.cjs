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

// Tất cả Excel sản xuất dùng một cấu trúc thống nhất:
// Bao cao san xuat -> Năm -> Tháng -> Bộ phận -> file Excel.
// Không tạo file ở Năm -> Bộ phận hoặc các thư mục ngẫu nhiên khác.
async function getCompanyMonthTarget({ root, date, fileName, groupCode, groupTitle }) {
  assertDate(date);
  const [year, month] = date.split('-');
  const normalizedFileName = safeFile(fileName, `A+B ${month}-${year}.xlsx`);

  // main.cjs ở các bản hiện tại chỉ truyền fileName. Suy ra đúng bộ phận
  // từ tên workbook để tuyệt đối không rơi về Năm\Bộ phận hoặc thư mục khác.
  let processFolder = normalizeProcessFolder({ groupCode, groupTitle });
  if (!groupCode && !groupTitle) {
    const compact = normalizedFileName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase();
    if (compact.includes('GIA CONG')) processFolder = 'Gia công';
    else if (compact.includes('MAI - DO') || compact.includes('MAI - DO')) processFolder = 'Mài - Đo';
  }

  const folder = path.join(root, year, month, processFolder);
  await fs.mkdir(folder, { recursive: true });
  return {
    layout: 'YEAR_MONTH_DEPARTMENT_COMPANY_FILE',
    folder,
    filePath: path.join(folder, normalizedFileName),
    fileName: normalizedFileName,
    processFolder
  };
}

async function getProcessMonthTarget({ root, date, processCode, processName, fileName }) {
  assertDate(date);
  const [year, month] = date.split('-');
  const processFolder = normalizeProcessFolder({ processCode, processName });
  const normalizedFileName = safeFile(
    fileName || processReportFileName({ processCode, processName, month, year }),
    `Bao-cao-${processFolder}-${month}-${year}.xlsx`
  );
  const folder = path.join(root, year, month, processFolder);
  await fs.mkdir(folder, { recursive: true });
  return {
    layout: 'YEAR_MONTH_DEPARTMENT_PROCESS_FILE',
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
