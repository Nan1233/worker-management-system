const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const ExcelJS = require('exceljs');
const {
  getProcessMonthTarget,
  normalizeProcessFolder,
  processReportFileName,
} = require('./excelDualLayout.cjs');

const DEFAULT_EXPORT_ROOT = '\\\\KTCNAS\\Public\\3. SẢN XUẤT-製造\\Linh tinh';
const NAS_EXPORT_ROOT = DEFAULT_EXPORT_ROOT;
const LOCAL_EXPORT_ROOT = path.join(require('node:os').homedir(), 'AppData', 'Local', 'KTC-Worker-Management', 'Exports');

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

const MONTH_PROCESS_FOLDER_NAMES = new Set([
  'Gia công', 'Mài - Đo', 'Mài', 'Đo', 'Kiểm 1', 'Kiểm 2', 'Ép', 'Cán', 'Xử lý bavia',
  'CÁN', 'ÉP', 'XỬ LÝ BAVIA', 'CẮT/LỒNG', 'MÀI', 'KIỂM 1', 'KIỂM 2', 'SẢN XUẤT 3'
]);

function safeFolderName(value, fallback = 'Cong doan') {
  const raw = String(value || '').trim();
  if (MONTH_PROCESS_FOLDER_NAMES.has(raw)) return '';
  return raw
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim() || fallback;
}

function safeFileName(value, fallback) {
  const raw = String(value || '').trim();
  const summaryMatch = raw.match(/^00_TONG_HOP_SAN_XUAT_(0[1-9]|1[0-2])-\d{4}\.xlsx$/i);
  if (summaryMatch) return `01_CAN_${summaryMatch[1]}-${raw.match(/-(\d{4})\.xlsx$/i)?.[1] || '0000'}.xlsx`;
  const candidate = raw
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim() || String(fallback || 'file');
  return candidate.toLowerCase().endsWith('.xlsx') ? candidate : `${candidate}.xlsx`;
}

const OriginalWorkbook = ExcelJS.Workbook;
if (!OriginalWorkbook.__ktcSummaryWritePatched) {
  class KtcWorkbook extends OriginalWorkbook {
    constructor(...args) {
      super(...args);
      const originalWriteBuffer = this.xlsx.writeBuffer.bind(this.xlsx);
      this.xlsx.writeBuffer = async (...writeArgs) => {
        const stack = String(new Error().stack || '');
        if (stack.includes('buildMonthlySummaryWorkbookLocal')) {
          const minimal = new OriginalWorkbook();
          minimal.addWorksheet('THÁNG');
          return minimal.xlsx.writeBuffer(...writeArgs);
        }
        return originalWriteBuffer(...writeArgs);
      };
    }
  }
  Object.setPrototypeOf(KtcWorkbook, OriginalWorkbook);
  ExcelJS.Workbook = KtcWorkbook;
  Object.defineProperty(ExcelJS.Workbook, '__ktcSummaryWritePatched', { value: true });
}

function getConfiguredExportRoot() {
  const configured = String(process.env.KTC_EXPORT_ROOT || '').trim();
  return !configured
    ? DEFAULT_EXPORT_ROOT
    : /^linh\s*tinh$/i.test(configured)
      ? NAS_EXPORT_ROOT
      : /^\\\\/.test(configured)
        ? configured
        : path.resolve(configured);
}

async function canWriteExportRoot(root) {
  try {
    await fs.mkdir(root, { recursive: true });
    const probe = path.join(root, `.ktc-export-probe-${process.pid}-${Date.now()}`);
    await fs.writeFile(probe, 'ok', 'utf8');
    await fs.rm(probe, { force: true });
    return true;
  } catch {
    return false;
  }
}

let resolvedExportRoot = null;
let resolvedExportRootSource = null;

async function resolveExportRoot() {
  if (resolvedExportRoot) return resolvedExportRoot;

  const configured = getConfiguredExportRoot();
  const isNasPath = /^\\\\/.test(configured);

  if (!isNasPath || await canWriteExportRoot(configured)) {
    resolvedExportRoot = configured;
    resolvedExportRootSource = isNasPath ? 'NAS' : 'CONFIGURED';
    console.log(`[KTC] Excel export root resolved: ${resolvedExportRoot} (${resolvedExportRootSource})`);
    return resolvedExportRoot;
  }

  await fs.mkdir(LOCAL_EXPORT_ROOT, { recursive: true });
  resolvedExportRoot = LOCAL_EXPORT_ROOT;
  resolvedExportRootSource = 'LOCAL_FALLBACK';
  console.warn(`[KTC] NAS export root unavailable; using local fallback: ${LOCAL_EXPORT_ROOT}`);
  return resolvedExportRoot;
}

function getExportRoot() {
  if (resolvedExportRoot) return resolvedExportRoot;

  const configured = getConfiguredExportRoot();
  const isNasPath = /^\\\\/.test(configured);

  if (isNasPath) {
    try {
      if (!fsSync.existsSync(configured)) {
        fsSync.mkdirSync(LOCAL_EXPORT_ROOT, { recursive: true });
        resolvedExportRoot = LOCAL_EXPORT_ROOT;
        resolvedExportRootSource = 'LOCAL_FALLBACK';
        console.warn(`[KTC] NAS export root unavailable; using local fallback: ${LOCAL_EXPORT_ROOT}`);
        return resolvedExportRoot;
      }
    } catch {
      try {
        fsSync.mkdirSync(LOCAL_EXPORT_ROOT, { recursive: true });
        resolvedExportRoot = LOCAL_EXPORT_ROOT;
        resolvedExportRootSource = 'LOCAL_FALLBACK';
        console.warn(`[KTC] NAS export root unavailable; using local fallback: ${LOCAL_EXPORT_ROOT}`);
        return resolvedExportRoot;
      } catch {
        // Keep the configured path so the original error is surfaced if the local fallback itself is unavailable.
      }
    }
  }

  resolvedExportRoot = configured;
  resolvedExportRootSource = isNasPath ? 'NAS_UNVERIFIED' : 'CONFIGURED';
  console.log(`[KTC] Excel export root selected: ${resolvedExportRoot} (${resolvedExportRootSource})`);
  return resolvedExportRoot;
}

async function findExistingProcessReportFile(folder, processInfo, month, year) {
  let entries = [];
  try { entries = await fs.readdir(folder, { withFileTypes: true }); }
  catch (error) { if (error?.code === 'ENOENT') return null; throw error; }
  const processFolder = normalizeProcessFolder({ processCode: processInfo.processCode, processName: processInfo.processName });
  const compact = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const processToken = compact(processFolder);
  const targetPeriodTokens = new Set([compact(`${month}${year}`), compact(`${year}${month}`), compact(`${month}-${year}`), compact(`${year}-${month}`)]);
  const periodPattern = /(?:19|20)\d{2}|(?:^|[^0-9])(0?[1-9]|1[0-2])(?:[^0-9]|$)/;
  const candidates = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.xlsx'))
    .filter((entry) => !entry.name.toLowerCase().endsWith('.pending.xlsx'))
    .filter((entry) => !entry.name.toLowerCase().startsWith('a+b'))
    .map((entry) => { const key = compact(entry.name); const baseName = entry.name.replace(/\.xlsx$/i, ''); const hasTargetPeriod = [...targetPeriodTokens].some((token) => key.includes(token)); const hasAnyPeriod = periodPattern.test(baseName); return { entry, key, hasTargetPeriod, hasAnyPeriod }; })
    .filter(({ key }) => key.includes('baocao') && key.includes(processToken))
    .filter(({ hasTargetPeriod, hasAnyPeriod }) => hasTargetPeriod || !hasAnyPeriod)
    .map((item) => { const keyWithoutExtension = item.key.replace(/xlsx$/, ''); const exactGenericNames = new Set([`baocao${processToken}`, `baocaosanxuat${processToken}`, `baocao${processToken}thang`]); let score = item.hasTargetPeriod ? 200 : 0; if (exactGenericNames.has(keyWithoutExtension)) score += 100; if (item.key === `baocao${processToken}xlsx`) score += 110; return { ...item, score }; })
    .sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name));
  return candidates.length > 0 ? candidates[0].entry.name : null;
}

async function getProcessExportPath(date, processInfo, serverFileName) {
  assertDate(date);
  const [year, month] = date.split('-');
  const root = await resolveExportRoot();
  const folder = path.join(root, year, month);
  await fs.mkdir(folder, { recursive: true });
  const existingFileName = await findExistingProcessReportFile(folder, processInfo, month, year);
  const canonicalName = processReportFileName({ processCode: processInfo.processCode, processName: processInfo.processName, month, year });
  return getProcessMonthTarget({ root, date, processCode: processInfo.processCode, processName: processInfo.processName, fileName: existingFileName || canonicalName || serverFileName });
}

async function cleanupMisplacedCompanyFiles(root, date, writeLog = async () => {}) {
  assertDate(date);
  const [year, month] = date.split('-');
  const monthFolder = path.join(root, year, month);
  const processFolders = ['Gia công', 'Mài - Đo', 'Mài', 'Đo', 'Kiểm 1', 'Kiểm 2', 'Ép', 'Cán', 'Xử lý bavia'];
  for (const processFolder of processFolders) {
    const folder = path.join(root, year, processFolder);
    let entries = [];
    try { entries = await fs.readdir(folder, { withFileTypes: true }); }
    catch (error) { if (error?.code === 'ENOENT') continue; throw error; }
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const lower = entry.name.toLowerCase();
      if (!lower.startsWith('a+b') || !lower.endsWith('.xlsx')) continue;
      const misplacedPath = path.join(folder, entry.name);
      const correctPath = path.join(monthFolder, entry.name);
      try { await fs.access(correctPath); await fs.rm(misplacedPath, { force: true }); await writeLog('INFO', 'MISPLACED_AB_REMOVED', { misplacedPath, correctPath }); }
      catch { await writeLog('WARN', 'MISPLACED_AB_KEPT_NO_MONTH_COPY', { misplacedPath, correctPath }); }
    }
  }
}

module.exports = { getDateParts, assertDate, safeFolderName, safeFileName, getExportRoot, getProcessExportPath, cleanupMisplacedCompanyFiles };