const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {
  getProcessMonthTarget,
  normalizeProcessFolder,
  processReportFileName,
} = require('./excelDualLayout.cjs');

function getDateParts(dateValue = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const [year, month, day] = formatter.format(dateValue).split('-');
  return { year, month, day, date: `${year}-${month}-${day}` };
}

function assertDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new Error('Ngày đồng bộ Excel không hợp lệ.');
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error('Ngày đồng bộ Excel không tồn tại.');
  }
}

function safeFolderName(value, fallback = 'Cong doan') {
  return String(value || fallback)
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim() || fallback;
}

function safeFileName(value, fallback) {
  const candidate = safeFolderName(value, fallback);
  return candidate.toLowerCase().endsWith('.xlsx') ? candidate : `${candidate}.xlsx`;
}

function getExportRoot() {
  const configured = String(process.env.KTC_EXPORT_ROOT || '').trim();
  if (configured) return path.resolve(configured);
  return path.join(os.homedir(), 'Documents', 'KTC', 'Bao cao san xuat');
}

async function findExistingProcessReportFile(folder, processInfo, month, year) {
  let entries = [];
  try {
    entries = await fs.readdir(folder, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }

  const processFolder = normalizeProcessFolder({
    processCode: processInfo.processCode,
    processName: processInfo.processName
  });
  const compact = (value) => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  const processToken = compact(processFolder);
  const targetPeriodTokens = new Set([
    compact(`${month}${year}`), compact(`${year}${month}`),
    compact(`${month}-${year}`), compact(`${year}-${month}`)
  ]);
  const periodPattern = /(?:19|20)\d{2}|(?:^|[^0-9])(0?[1-9]|1[0-2])(?:[^0-9]|$)/;

  const candidates = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.xlsx'))
    .filter((entry) => !entry.name.toLowerCase().endsWith('.pending.xlsx'))
    .filter((entry) => !entry.name.toLowerCase().startsWith('a+b'))
    .map((entry) => {
      const key = compact(entry.name);
      const baseName = entry.name.replace(/\.xlsx$/i, '');
      const hasTargetPeriod = [...targetPeriodTokens].some((token) => key.includes(token));
      const hasAnyPeriod = periodPattern.test(baseName);
      return { entry, key, hasTargetPeriod, hasAnyPeriod };
    })
    .filter(({ key }) => key.includes('baocao') && key.includes(processToken))
    .filter(({ hasTargetPeriod, hasAnyPeriod }) => hasTargetPeriod || !hasAnyPeriod)
    .map((item) => {
      const keyWithoutExtension = item.key.replace(/xlsx$/, '');
      const exactGenericNames = new Set([
        `baocao${processToken}`,
        `baocaosanxuat${processToken}`,
        `baocao${processToken}thang`
      ]);
      let score = item.hasTargetPeriod ? 200 : 0;
      if (exactGenericNames.has(keyWithoutExtension)) score += 100;
      if (item.key === `baocao${processToken}xlsx`) score += 110;
      return { ...item, score };
    })
    .sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name));

  return candidates.length > 0 ? candidates[0].entry.name : null;
}

async function getProcessExportPath(date, processInfo, serverFileName) {
  assertDate(date);
  const [year, month] = date.split('-');
  const root = getExportRoot();
  const processFolder = normalizeProcessFolder({
    processCode: processInfo.processCode,
    processName: processInfo.processName
  });
  const folder = path.join(root, year, processFolder);
  await fs.mkdir(folder, { recursive: true });

  const existingFileName = await findExistingProcessReportFile(folder, processInfo, month, year);
  const canonicalName = processReportFileName({
    processCode: processInfo.processCode,
    processName: processInfo.processName,
    month,
    year
  });

  return getProcessMonthTarget({
    root,
    date,
    processCode: processInfo.processCode,
    processName: processInfo.processName,
    fileName: existingFileName || canonicalName || serverFileName
  });
}

async function cleanupMisplacedCompanyFiles(root, date, writeLog = async () => {}) {
  assertDate(date);
  const [year, month] = date.split('-');
  const monthFolder = path.join(root, year, month);
  const processFolders = ['Gia công', 'Mài', 'Đo', 'Kiểm 1', 'Kiểm 2', 'Ép', 'Cán', 'Xử lý bavia'];

  for (const processFolder of processFolders) {
    const folder = path.join(root, year, processFolder);
    let entries = [];
    try {
      entries = await fs.readdir(folder, { withFileTypes: true });
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const lower = entry.name.toLowerCase();
      if (!lower.startsWith('a+b') || !lower.endsWith('.xlsx')) continue;
      const misplacedPath = path.join(folder, entry.name);
      const correctPath = path.join(monthFolder, entry.name);
      try {
        await fs.access(correctPath);
        await fs.rm(misplacedPath, { force: true });
        await writeLog('INFO', 'MISPLACED_AB_REMOVED', { misplacedPath, correctPath });
      } catch {
        await writeLog('WARN', 'MISPLACED_AB_KEPT_NO_MONTH_COPY', { misplacedPath, correctPath });
      }
    }
  }
}

module.exports = {
  getDateParts,
  assertDate,
  safeFolderName,
  safeFileName,
  getExportRoot,
  getProcessExportPath,
  cleanupMisplacedCompanyFiles,
};
