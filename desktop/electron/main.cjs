const { app, BrowserWindow, ipcMain, shell, session, powerMonitor } = require('electron');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { buildCompanyExcelLocal, buildProcessExcelLocal } = require('./companyExcelLocal.cjs');
const { buildMonthlyWorkbookLocal, buildReconciliationWorkbook } = require('./monthlyWorkbookLocal.cjs');
const {
  getCompanyMonthTarget,
  getProcessMonthTarget,
  normalizeProcessFolder,
  processReportFileName
} = require('./excelDualLayout.cjs');

const execFileAsync = promisify(execFile);

const API_BASE_URL = String(
  process.env.KTC_API_URL || 'https://worker-management-system-2-5jqv.onrender.com/api'
).replace(/\/+$/, '');
const SYNC_INTERVAL_MS = Math.max(300_000, Number(process.env.KTC_SYNC_INTERVAL_MS) || 300_000);
const AUTO_EXCEL_SYNC_ENABLED = String(process.env.KTC_AUTO_EXCEL_SYNC || '').trim().toLowerCase() === 'true';
const REQUEST_TIMEOUT_MS = Math.max(30_000, Number(process.env.KTC_REQUEST_TIMEOUT_MS) || 120_000);
const RETRY_DELAY_MS = 1200;
const RETRY_COUNT = 4;
const DOWNLOAD_RETRY_COUNT = 2;

let mainWindow = null;
let syncTimer = null;
let currentToken = '';
let syncRunning = false;
let manualSyncTail = Promise.resolve();
let queuedManualSyncCount = 0;
let quitting = false;
let tokenDiscoveryTimer = null;
let lastApprovedMutationAt = 0;
let lastSuccessfulSyncAt = 0;

const appDataRoot = path.join(os.homedir(), 'AppData', 'Local', 'KTC-Worker-Management');
app.setPath('userData', path.join(appDataRoot, 'UserData'));
app.setPath('cache', path.join(appDataRoot, 'Cache'));
app.commandLine.appendSwitch('disk-cache-dir', path.join(appDataRoot, 'Cache'));
app.commandLine.appendSwitch('gpu-cache-dir', path.join(appDataRoot, 'GPUCache'));

function nowText() {
  return new Date().toISOString();
}

function normalizeError(error) {
  if (error instanceof Error) return { message: error.message, stack: error.stack, code: error.code };
  return { message: String(error) };
}

async function rotateDesktopLogIfNeeded(logPath) {
  const maxBytes = Math.max(1, Number(process.env.DESKTOP_LOG_MAX_MB || 8)) * 1024 * 1024;
  try {
    const stat = await fs.stat(logPath);
    if (stat.size < maxBytes) return;
    for (let index = 4; index >= 1; index -= 1) {
      const source = `${logPath}.${index}`;
      const target = `${logPath}.${index + 1}`;
      await fs.rm(target, { force: true }).catch(() => {});
      await fs.rename(source, target).catch(() => {});
    }
    await fs.rename(logPath, `${logPath}.1`).catch(() => {});
  } catch {
    // A missing log file does not require rotation.
  }
}

async function writeLog(level, message, details) {
  const serialized = details === undefined ? '' : ` ${typeof details === 'string' ? details : JSON.stringify(details)}`;
  const line = `[${nowText()}] [${level}] ${message}${serialized}\n`;
  try {
    const folder = path.join(app.getPath('userData'), 'logs');
    const logPath = path.join(folder, 'desktop.log');
    await fs.mkdir(folder, { recursive: true });
    await rotateDesktopLogIfNeeded(logPath);
    await fs.appendFile(logPath, line, 'utf8');
  } catch {
    // Logging must never crash the desktop application.
  }
  const method = level === 'ERROR' ? console.error : level === 'WARN' ? console.warn : console.log;
  method(line.trim());
}

process.on('uncaughtException', (error) => void writeLog('ERROR', 'UNCAUGHT_EXCEPTION', normalizeError(error)));
process.on('unhandledRejection', (error) => void writeLog('ERROR', 'UNHANDLED_REJECTION', normalizeError(error)));

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
  const configured = String(process.env.KTC_EXPORT_ROOT || "").trim();
  if (configured) {
    return path.resolve(configured);
  }

  return path.join(
    os.homedir(),
    "Documents",
    "KTC",
    "Bao cao san xuat"
  );
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
    compact(`${month}${year}`),
    compact(`${year}${month}`),
    compact(`${month}-${year}`),
    compact(`${year}-${month}`)
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
    // Chỉ tái sử dụng file đúng tháng hoặc file tên chung không chứa kỳ.
    // Tuyệt đối không chọn file 07-2026 để ghi dữ liệu 08-2026.
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

  // Ưu tiên đúng file báo cáo tháng đã tồn tại tại công ty, ví dụ:
  // Bao-cao-Gia-cong-07-2026.xlsx. Nhờ đó không tạo thêm một tên mới rồi bỏ
  // nguyên file cũ chưa được cập nhật.
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

async function cleanupMisplacedCompanyFiles(root, date) {
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
        // Không xóa nếu chưa có bản đúng trong thư mục tháng.
        await writeLog('WARN', 'MISPLACED_AB_KEPT_NO_MONTH_COPY', { misplacedPath, correctPath });
      }
    }
  }
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error(`Máy chủ phản hồi quá ${Math.round(REQUEST_TIMEOUT_MS / 1000)} giây.`);
      timeoutError.code = 'API_TIMEOUT';
      throw timeoutError;
    }
    const networkError = new Error(
      `Không kết nối được backend KTC (${API_BASE_URL}). ` +
      'Kiểm tra Internet hoặc chờ Render khởi động rồi thử lại.'
    );
    networkError.code = 'API_FETCH_FAILED';
    networkError.cause = error;
    throw networkError;
  } finally {
    clearTimeout(timer);
  }
}

async function readApiError(response) {
  try {
    const type = response.headers.get('content-type') || '';
    if (type.includes('application/json')) {
      const data = await response.json();
      return data.message || data.error || JSON.stringify(data);
    }
    const text = (await response.text()).trim();
    if (!text) return `HTTP ${response.status}`;
    if (/<html|<!doctype/i.test(text)) return `HTTP ${response.status} - dịch vụ Render tạm thời không khả dụng.`;
    return text.length > 500 ? `${text.slice(0, 500)}…` : text;
  } catch {
    return `HTTP ${response.status}`;
  }
}

async function fetchProcesses(date) {
  const response = await authenticatedFetch(
    `${API_BASE_URL}/reports/export-excel/processes?date=${encodeURIComponent(date)}`,
    { method: 'GET' }
  );
  if (response.status === 401 || response.status === 403) throw new Error('Phiên đăng nhập đã hết hạn hoặc không có quyền xuất Excel.');
  if (!response.ok) throw new Error(await readApiError(response));
  const payload = await response.json();
  return Array.isArray(payload.data) ? payload.data : [];
}

async function fetchCompanyFiles(token, date) {
  const response = await fetchWithTimeout(
    `${API_BASE_URL}/reports/export-excel/company-files?date=${encodeURIComponent(date)}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
  );
  if (response.status === 401 || response.status === 403) throw new Error('Phiên đăng nhập đã hết hạn hoặc không có quyền xuất Excel.');
  if (response.status === 404) {
    // Tương thích trong thời gian backend Render đang chuyển phiên bản.
    // Vẫn thử xuất hai workbook chuẩn; endpoint POST sẽ cho biết backend đã
    // được deploy đầy đủ hay chưa.
    await writeLog('WARN', 'COMPANY_FILE_LIST_404_USING_DEFAULT_GROUPS', { date });
    return [
      { code: 'GIA_CONG', title: 'Gia công', reportCount: 0 },
      { code: 'MAI_DO', title: 'Mài - Đo', reportCount: 0 }
    ];
  }
  if (!response.ok) throw new Error(await readApiError(response));
  const payload = await response.json();
  const rows = Array.isArray(payload.data) ? payload.data : [];
  return rows.length ? rows : [
    { code: 'GIA_CONG', title: 'Gia công', reportCount: 0 },
    { code: 'MAI_DO', title: 'Mài - Đo', reportCount: 0 }
  ];
}

async function fetchCompanyData(date) {
  const url = `${API_BASE_URL}/reports/export-excel/company-data?date=${encodeURIComponent(date)}`;
  const response = await authenticatedFetch(url, { method: 'GET' });
  if (response.status === 401 || response.status === 403) {
    throw new Error('Phiên đăng nhập đã hết hạn hoặc không có quyền xuất Excel.');
  }
  if (!response.ok) {
    const message = await readApiError(response);
    const error = new Error(`Backend xuất Excel lỗi: ${message}`);
    error.code = `COMPANY_DATA_HTTP_${response.status}`;
    throw error;
  }
  const payload = await response.json();
  if (!payload?.success || !payload?.data?.processes) {
    const error = new Error('Backend không trả dữ liệu Excel tháng hợp lệ.');
    error.code = 'COMPANY_DATA_INVALID_PAYLOAD';
    throw error;
  }
  return payload.data;
}

function parseDownloadFileName(response, fallback) {
  const value = response.headers.get('content-disposition') || '';
  const utf8 = value.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const normal = value.match(/filename="?([^";]+)"?/i)?.[1];
  const encoded = utf8 || normal;
  if (!encoded) return fallback;
  try { return decodeURIComponent(encoded); } catch { return encoded; }
}


async function downloadConsolidatedExcelOnce(token, date) {
  const response = await fetchWithTimeout(`${API_BASE_URL}/reports/export-excel`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/json'
    },
    body: JSON.stringify({ date })
  });
  if (response.status === 401 || response.status === 403) {
    throw new Error('Phiên đăng nhập đã hết hạn hoặc không có quyền xuất Excel.');
  }
  if (!response.ok) throw new Error(await readApiError(response));

  const contentType = response.headers.get('content-type') || '';
  const buffer = Buffer.from(await response.arrayBuffer());
  const isZip = buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
  if (!contentType.includes('spreadsheetml') || !isZip) {
    throw new Error('Backend không trả file Excel tổng hợp hợp lệ.');
  }

  const [year, month] = date.split('-');
  const fallback = `Bao-cao-san-xuat-${month}-${year}.xlsx`;
  const fileName = parseDownloadFileName(response, fallback);
  const folder = path.join(getExportRoot(), year, 'Tong hop');
  await fs.mkdir(folder, { recursive: true });
  return { buffer, folder, filePath: path.join(folder, safeFileName(fileName, fallback)), fileName };
}


async function downloadConsolidatedExcel(token, date) {
  let lastError;
  for (let attempt = 1; attempt <= DOWNLOAD_RETRY_COUNT; attempt += 1) {
    try {
      return await downloadConsolidatedExcelOnce(token, date);
    } catch (error) {
      lastError = error;
      await writeLog('WARN', 'CONSOLIDATED_DOWNLOAD_RETRY', {
        attempt,
        maxAttempts: DOWNLOAD_RETRY_COUNT,
        ...normalizeError(error)
      });
      if (attempt < DOWNLOAD_RETRY_COUNT) await wait(RETRY_DELAY_MS * attempt);
    }
  }
  throw lastError;
}

async function buildCompanyExcelOnDesktop(date, fileInfo, companyData) {
  const [year, month] = date.split('-');
  const fallback = `${safeFolderName(fileInfo.title || fileInfo.code)}-${month}-${year}.xlsx`;
  const expectedName = fileInfo.code === 'GIA_CONG'
    ? `A+B GIA CÔNG THÁNG ${month}-${year}.xlsx`
    : fileInfo.code === 'MAI_DO'
      ? `A+B MÀI - ĐO THÁNG ${month}-${year}.xlsx`
      : fallback;
  const target = await getCompanyMonthTarget({
    root: getExportRoot(),
    date,
    fileName: expectedName
  });
  const folder = target.folder;
  const existingFilePath = target.filePath;

  const built = await buildCompanyExcelLocal({
    appPath: app.getAppPath(),
    date,
    groupCode: fileInfo.code,
    payload: companyData,
    existingFilePath
  });
  const requestedYearMonth = date.slice(0, 7);
  if (built.requestedYearMonth !== requestedYearMonth) {
    throw new Error(`Workbook ${fileInfo.title} sai kỳ: yêu cầu ${requestedYearMonth}, nhận ${built.requestedYearMonth || 'trống'}`);
  }
  const fileName = built.fileName || expectedName;
  return {
    buffer: built.buffer,
    folder,
    filePath: path.join(folder, safeFileName(fileName, fallback)),
    fileName,
    reusedExistingFile: false,
    requestedYearMonth: built.requestedYearMonth,
    periodReplacementCount: Number(built.periodReplacementCount || 0)
  };
}

function normalizeProcessInfo(row) {
  return {
    ...row,
    id: Number(row?.id ?? row?.processId ?? row?.process_id),
    processCode: row?.processCode ?? row?.process_code ?? row?.code ?? '',
    processName: row?.processName ?? row?.process_name ?? row?.name ?? row?.title ?? ''
  };
}

async function downloadProcessExcel(token, date, rawProcessInfo, attempt = 1) {
  const processInfo = normalizeProcessInfo(rawProcessInfo);
  if (!Number.isFinite(processInfo.id) || processInfo.id <= 0) {
    throw new Error(`Thiếu processId hợp lệ cho công đoạn ${processInfo.processName || processInfo.processCode || 'không xác định'}.`);
  }

  const response = await fetchWithTimeout(`${API_BASE_URL}/reports/export-excel/process`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/json'
    },
    body: JSON.stringify({ date, processId: Number(processInfo.id) })
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error('Phiên đăng nhập đã hết hạn hoặc không có quyền xuất Excel.');
  }

  if (!response.ok) {
    const retryable = [429, 502, 503, 504].includes(response.status);
    const message = await readApiError(response);
    if (retryable && attempt < 4) {
      const retryAfter = Number(response.headers.get('retry-after'));
      const delayMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : Math.min(15000, 3000 * attempt);
      await writeLog('WARN', 'PROCESS_EXCEL_RETRY', {
        processId: processInfo.id,
        processCode: processInfo.processCode,
        attempt,
        status: response.status,
        delayMs,
        message
      });
      await wait(delayMs);
      return downloadProcessExcel(token, date, processInfo, attempt + 1);
    }
    throw new Error(message);
  }

  const contentType = response.headers.get('content-type') || '';
  const buffer = Buffer.from(await response.arrayBuffer());
  const isZip = buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
  if (!contentType.includes('spreadsheetml') || !isZip) {
    throw new Error(`Backend không trả file Excel hợp lệ cho công đoạn ${processInfo.processName || processInfo.id}.`);
  }

  const [year, month] = date.split('-');
  const fallback = `Bao-cao-${safeFolderName(processInfo.processCode || processInfo.processName)}-${month}-${year}.xlsx`;
  const fileName = parseDownloadFileName(response, fallback);
  const { folder, filePath } = await getProcessExportPath(date, processInfo, fileName);
  return { buffer, folder, filePath, fileName: path.basename(filePath), serverFileName: fileName };
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function compareYearMonth(yearA, monthA, yearB, monthB) {
  return Number(`${yearA}${monthA}`) - Number(`${yearB}${monthB}`);
}

async function keepOnlyLastBackupInMonth(monthFolder) {
  let entries;
  try {
    entries = await fs.readdir(monthFolder, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }

  const files = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.xlsx'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  if (files.length <= 1) return;
  const keep = files[files.length - 1];
  for (const fileName of files.slice(0, -1)) {
    await fs.rm(path.join(monthFolder, fileName), { force: true });
  }
  await writeLog('INFO', 'EXCEL_BACKUP_MONTH_COMPACTED', {
    monthFolder,
    keptFile: keep,
    removedCount: files.length - 1
  });
}

async function compactCompletedBackupMonths(processBackupRoot, currentYear, currentMonth) {
  let yearEntries;
  try {
    yearEntries = await fs.readdir(processBackupRoot, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }

  for (const yearEntry of yearEntries) {
    if (!yearEntry.isDirectory() || !/^\d{4}$/.test(yearEntry.name)) continue;
    const yearFolder = path.join(processBackupRoot, yearEntry.name);
    const monthEntries = await fs.readdir(yearFolder, { withFileTypes: true }).catch(() => []);
    for (const monthEntry of monthEntries) {
      if (!monthEntry.isDirectory() || !/^\d{2}$/.test(monthEntry.name)) continue;
      if (compareYearMonth(yearEntry.name, monthEntry.name, currentYear, currentMonth) < 0) {
        await keepOnlyLastBackupInMonth(path.join(yearFolder, monthEntry.name));
      }
    }
  }
}

async function backupExistingExcel(filePath, syncDate) {
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) return null;

    assertDate(syncDate);
    const [year, month] = syncDate.split('-');
    const relative = path.relative(getExportRoot(), filePath);
    const relativeParts = relative.split(path.sep);
    const processName = safeFolderName(relativeParts.length >= 2 ? relativeParts[1] : 'Tong hop');
    const processBackupRoot = path.join(
      os.homedir(),
      'Documents',
      'KTC',
      'Backup',
      'Excel',
      processName
    );
    const monthFolder = path.join(processBackupRoot, year, month);
    const backupPath = path.join(
      monthFolder,
      `${path.basename(filePath, '.xlsx')}_${syncDate}.xlsx`
    );

    await compactCompletedBackupMonths(processBackupRoot, year, month);
    await fs.mkdir(monthFolder, { recursive: true });

    try {
      await fs.copyFile(filePath, backupPath, fsSync.constants.COPYFILE_EXCL);
      await writeLog('INFO', 'EXCEL_DAILY_BACKUP_CREATED', { filePath, backupPath, syncDate });
      return backupPath;
    } catch (error) {
      if (error?.code === 'EEXIST') {
        await writeLog('INFO', 'EXCEL_DAILY_BACKUP_ALREADY_EXISTS', { filePath, backupPath, syncDate });
        return backupPath;
      }
      throw error;
    }
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    await writeLog('ERROR', 'EXCEL_BACKUP_FAILED', { filePath, syncDate, ...normalizeError(error) });
    throw new Error(`Không thể sao lưu file Excel trước khi cập nhật: ${error.message}`);
  }
}



function escapePowerShellLiteral(value) {
  return String(value || '').replace(/'/g, "''");
}

async function reloadOpenExcelWorkbook(filePath, replacementPath) {
  if (process.platform !== 'win32') return { handled: false, reason: 'not-windows' };

  const target = escapePowerShellLiteral(path.resolve(filePath));
  const replacement = escapePowerShellLiteral(path.resolve(replacementPath));
  const script = `
$ErrorActionPreference = 'Stop'
$target = '${target}'
$replacement = '${replacement}'
try {
  $excel = [Runtime.InteropServices.Marshal]::GetActiveObject('Excel.Application')
} catch {
  Write-Output '{"handled":false,"reason":"excel-not-running"}'
  exit 0
}
$workbook = $null
foreach ($book in $excel.Workbooks) {
  if ([string]::Equals($book.FullName, $target, [System.StringComparison]::OrdinalIgnoreCase)) {
    $workbook = $book
    break
  }
}
if ($null -eq $workbook) {
  Write-Output '{"handled":false,"reason":"workbook-not-open"}'
  exit 0
}
if (-not $workbook.Saved) {
  Write-Output '{"handled":true,"reloaded":false,"reason":"unsaved-changes"}'
  exit 0
}
$wasActive = $workbook.Application.ActiveWorkbook -eq $workbook
$workbook.Close($false)
Copy-Item -LiteralPath $replacement -Destination $target -Force
Remove-Item -LiteralPath $replacement -Force -ErrorAction SilentlyContinue
$opened = $excel.Workbooks.Open($target)
$excel.CalculateFullRebuild()
$opened.Save()
if ($wasActive) { $opened.Activate() }
Write-Output '{"handled":true,"reloaded":true,"reason":"reopened"}'
`;

  try {
    const { stdout } = await execFileAsync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script
    ], { windowsHide: true, timeout: 45_000, maxBuffer: 1024 * 1024 });
    const lines = String(stdout || '').trim().split(/\r?\n/).filter(Boolean);
    const last = lines[lines.length - 1];
    return last ? JSON.parse(last) : { handled: false, reason: 'empty-response' };
  } catch (error) {
    await writeLog('WARN', 'EXCEL_COM_RELOAD_FAILED', { filePath, replacementPath, ...normalizeError(error) });
    return { handled: false, reason: 'powershell-error' };
  }
}

async function atomicOverwrite(filePath, buffer, syncDate) {
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const backupPath = await backupExistingExcel(filePath, syncDate);
  await fs.writeFile(temporaryPath, buffer, { flag: 'wx' });

  let lastError;
  for (let attempt = 1; attempt <= RETRY_COUNT; attempt += 1) {
    try {
      await fs.rm(filePath, { force: true });
      await fs.rename(temporaryPath, filePath);
      // Pending chỉ là bản chờ khi file đang khóa. Khi lần đồng bộ mới đã ghi
      // thành công từ dữ liệu DB mới nhất, xóa pending cũ để tránh áp dụng dữ liệu cũ.
      await fs.rm(`${filePath}.pending.xlsx`, { force: true }).catch(() => {});
      return { saved: true, pendingPath: null, backupPath };
    } catch (error) {
      lastError = error;
      if (!['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || attempt === RETRY_COUNT) break;
      await wait(RETRY_DELAY_MS * attempt);
    }
  }

  const pendingPath = `${filePath}.pending.xlsx`;
  try {
    await fs.rm(pendingPath, { force: true });
    await fs.rename(temporaryPath, pendingPath);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }

  const reloadResult = await reloadOpenExcelWorkbook(filePath, pendingPath);
  if (reloadResult.reloaded) {
    await writeLog('INFO', 'OPEN_EXCEL_RELOADED', { filePath, backupPath });
    return { saved: true, pendingPath: null, backupPath, reloadedOpenWorkbook: true };
  }

  await writeLog('WARN', 'FILE_LOCKED_PENDING_CREATED', {
    filePath,
    pendingPath,
    code: lastError?.code,
    reason: reloadResult.reason
  });
  return {
    saved: false,
    pendingPath,
    backupPath,
    waitingForExcelSave: reloadResult.reason === 'unsaved-changes'
  };
}

async function logPendingFiles(rootFolder) {
  let entries;
  try { entries = await fs.readdir(rootFolder, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    const fullPath = path.join(rootFolder, entry.name);
    if (entry.isDirectory()) {
      await logPendingFiles(fullPath);
    } else if (entry.isFile() && entry.name.endsWith('.pending.xlsx')) {
      // Không tự đổi tên pending thành file chính. Lần đồng bộ kế tiếp phải lấy
      // lại dữ liệu DB và chạy lại workbook; pending chỉ được xóa khi ghi mới thành công.
      await writeLog('INFO', 'PENDING_FILE_WAITING_FOR_FRESH_REBUILD', { pendingPath: fullPath });
    }
  }
}

async function syncProcessReportsFirst({ date, files, processes, companyData }) {
  const normalized = (processes || [])
    .map(normalizeProcessInfo)
    .filter((item) => Number.isFinite(item.id) && item.id > 0)
    .sort((a, b) => {
      const priority = (item) => String(item.processCode || '').toUpperCase() === 'GC' ? 0 : 1;
      return priority(a) - priority(b) || Number(b.reportCount || 0) - Number(a.reportCount || 0) || a.id - b.id;
    });

  await writeLog('INFO', 'PROCESS_LIST_READY', {
    date,
    count: normalized.length,
    processes: normalized.map((item) => ({
      id: item.id,
      code: item.processCode,
      name: item.processName,
      reportCount: Number(item.reportCount || item.report_count || 0)
    }))
  });

  const supported = new Set(['GC', 'MAI', 'DO']);
  const completedReportGroups = new Set();
  for (const processInfo of normalized) {
    const code = String(processInfo.processCode || '').toUpperCase();
    const reportCount = Number(processInfo.reportCount || processInfo.report_count || 0);
    if (!supported.has(code)) {
      if (reportCount > 0) {
        files.push({
          category: 'PROCESS', processId: processInfo.id, processCode: code,
          processName: processInfo.processName, success: false, skipped: true,
          error: `Chưa có template Desktop cho công đoạn ${processInfo.processName || code}.`
        });
      }
      continue;
    }
    const reportGroup = code === 'GC' ? 'GC' : 'MAI_DO';
    if (completedReportGroups.has(reportGroup)) {
      await writeLog('INFO', 'PROCESS_REPORT_GROUP_ALREADY_BUILT', {
        date, processCode: code, reportGroup
      });
      continue;
    }

    // Luôn dựng file báo cáo mẫu đúng tháng, kể cả chưa có dữ liệu đã duyệt.
    // buildProcessExcelLocal sẽ làm sạch vùng dữ liệu và giữ nguyên template/công thức.
    // Nhờ đó một lần cập nhật luôn tạo đủ Báo cáo công đoạn + hai file A+B.
    if (reportCount <= 0) {
      await writeLog('INFO', 'PROCESS_EXCEL_BUILD_EMPTY_PERIOD', {
        date,
        processCode: code,
        message: 'Kỳ chưa có báo cáo đã duyệt; vẫn tạo file mẫu đúng tháng.'
      });
    }

    await writeLog('INFO', 'PROCESS_EXCEL_LOCAL_START', {
      date, processId: processInfo.id, processCode: code, processName: processInfo.processName
    });
    try {
      const built = await buildProcessExcelLocal({
        appPath: app.getAppPath(), date, processCode: code, payload: companyData
      });
      if (built.skipped) {
        files.push({
          category: 'PROCESS', processId: processInfo.id, processCode: code,
          processName: processInfo.processName, success: true, skipped: true,
          code: built.code, message: built.message
        });
        continue;
      }
      const targetProcessInfo = {
        ...processInfo,
        processCode: built.processCode || processInfo.processCode,
        processName: built.processName || processInfo.processName
      };
      const target = await getProcessExportPath(date, targetProcessInfo, built.fileName);
      const writeResult = await atomicOverwrite(target.filePath, built.buffer, date);
      completedReportGroups.add(built.reportGroup || reportGroup);
      files.push({
        category: 'PROCESS', processId: processInfo.id, processCode: built.processCode || code,
        processName: built.processName || processInfo.processName,
        fileName: path.basename(target.filePath), filePath: target.filePath, folder: target.folder,
        size: built.buffer.length, saved: writeResult.saved, pendingPath: writeResult.pendingPath,
        success: true, localBuild: true, reportCount: built.reportCount
      });
      await writeLog('INFO', 'PROCESS_EXCEL_UPDATED_LOCAL', {
        processId: processInfo.id, processCode: code, filePath: target.filePath,
        saved: writeResult.saved, pendingPath: writeResult.pendingPath,
        reportCount: built.reportCount
      });
    } catch (error) {
      files.push({
        category: 'PROCESS', processId: processInfo.id, processCode: code,
        processName: processInfo.processName, success: false, localBuild: true, error: error.message
      });
      await writeLog('ERROR', 'PROCESS_EXCEL_LOCAL_FAILED', {
        date, processId: processInfo.id, processCode: code, ...normalizeError(error)
      });
      if (code === 'GC') break;
    }
  }
}

async function performSync({ date, source }) {
  const startedAt = Date.now();
  await writeLog('INFO', 'SYNC_START', { source, date, mode: 'one-month-one-workbook' });

  const root = getExportRoot();
  await fs.mkdir(root, { recursive: true });
  await logPendingFiles(root);

  const token = await waitForUsableRendererToken('', 8_000);
  if (!token) throw new Error('Chưa đăng nhập hoặc phiên đăng nhập chưa được làm mới.');
  currentToken = token;

  const files = [];
  try {
    const companyData = await fetchCompanyData(date);
    const processCounts = Object.fromEntries(
      Object.entries(companyData?.processes || {}).map(([code, data]) => [
        code,
        {
          reports: Array.isArray(data?.reports) ? data.reports.length : 0,
          deductionTypes: Array.isArray(data?.deductionTypes) ? data.deductionTypes.length : 0,
          defectTypes: Array.isArray(data?.defectTypes) ? data.defectTypes.length : 0
        }
      ])
    );
    const totalReportCount = Object.values(processCounts).reduce(
      (sum, item) => sum + Number(item?.reports || 0),
      0
    );
    await writeLog('INFO', 'COMPANY_DATA_RECEIVED', { date, totalReportCount, processCounts });
    if (totalReportCount === 0) {
      const error = new Error(
        `Backend không trả báo cáo đã duyệt cho tháng ${String(date).slice(0, 7)}. ` +
        `Kiểm tra trạng thái duyệt, ngày báo cáo và bản backend đang chạy.`
      );
      error.code = 'MONTHLY_REPORT_DATA_EMPTY';
      throw error;
    }
    const [year, month] = date.split('-');
    const folder = path.join(root, year, month);
    const reportFileName = `Bao-cao-san-xuat-${month}-${year}.xlsx`;
    const reportFilePath = path.join(folder, reportFileName);
    const dataFileName = `Du-lieu-doi-chieu-${month}-${year}.xlsx`;
    const dataFilePath = path.join(folder, dataFileName);

    await writeLog('INFO', 'MONTHLY_TWO_WORKBOOKS_START', { date, reportFilePath, dataFilePath });
    const dataBuilt = await buildReconciliationWorkbook({
      appPath: app.getAppPath(),
      date,
      payload: companyData
    });
    const dataWrite = await atomicOverwrite(dataFilePath, dataBuilt.buffer, date);
    files.push({
      category: 'MONTHLY_DATA', processId: -1, processCode: 'ALL',
      processName: 'Dữ liệu đối chiếu tháng', fileName: dataFileName, filePath: dataFilePath,
      folder, size: dataBuilt.buffer.length, saved: dataWrite.saved,
      pendingPath: dataWrite.pendingPath, backupPath: dataWrite.backupPath,
      success: true, rowCount: dataBuilt.rowCount
    });

    const reportBuilt = await buildMonthlyWorkbookLocal({
      appPath: app.getAppPath(), date, payload: companyData
    });
    const reportWrite = await atomicOverwrite(reportFilePath, reportBuilt.buffer, date);
    files.push({
      category: 'MONTHLY_REPORT', processId: -1, processCode: 'ALL',
      processName: 'Báo cáo sản xuất tháng', fileName: reportFileName, filePath: reportFilePath,
      folder, size: reportBuilt.buffer.length, saved: reportWrite.saved,
      pendingPath: reportWrite.pendingPath, backupPath: reportWrite.backupPath,
      success: true, sheetResults: reportBuilt.results,
      formulaReplacementCount: reportBuilt.formulaReplacementCount
    });

    await writeLog('INFO', 'MONTHLY_TWO_WORKBOOKS_UPDATED', {
      date, reportFilePath, dataFilePath, rowCount: dataBuilt.rowCount,
      sheetResults: reportBuilt.results,
      formulaReplacementCount: reportBuilt.formulaReplacementCount
    });
  } catch (error) {
    files.push({
      category: 'MONTHLY',
      processId: -1,
      processCode: 'ALL',
      processName: 'Báo cáo sản xuất tháng',
      success: false,
      error: error.message
    });
    await writeLog('ERROR', 'MONTHLY_WORKBOOK_FAILED', { date, ...normalizeError(error) });
  }

  const success = files.length === 2 && files.every((file) => file.success === true);
  const result = {
    success,
    partialSuccess: false,
    message: success
      ? 'Đã tạo 2 file Excel cho tháng: dữ liệu đối chiếu và báo cáo sản xuất.'
      : 'Không thể cập nhật file Excel tháng. Xem desktop.log để biết chi tiết.',
    date,
    files,
    rootFolder: root,
    savedAt: new Date().toISOString(),
    elapsedMs: Date.now() - startedAt
  };

  await writeLog('INFO', 'SYNC_FINISH', {
    source,
    date,
    fileCount: files.length,
    success,
    elapsedMs: result.elapsedMs
  });
  return result;
}

async function syncAllProcessExcel({ date, source = 'manual', token: requestedToken = '' } = {}) {
  assertDate(date);
  const token = await waitForUsableRendererToken(requestedToken, 8_000);
  if (!token) throw new Error('Chưa đăng nhập hoặc thiếu token.');
  currentToken = token;

  if (syncRunning) {
    throw new Error(`Lỗi điều phối đồng bộ: ${source} được chạy khi một tác vụ khác chưa kết thúc.`);
  }

  syncRunning = true;
  await writeLog('INFO', 'EXCEL_SYNC_LOCK_ACQUIRED', { date, source, queuedManualSyncCount });
  try {
    return await performSync({ date, source });
  } finally {
    syncRunning = false;
    await writeLog('INFO', 'EXCEL_SYNC_LOCK_RELEASED', { date, source, queuedManualSyncCount });
  }
}

function enqueueManualExcelSync(request) {
  const queuedAt = Date.now();
  queuedManualSyncCount += 1;
  const queuePosition = queuedManualSyncCount;

  const task = manualSyncTail.then(async () => {
    queuedManualSyncCount = Math.max(0, queuedManualSyncCount - 1);
    await writeLog('INFO', 'MANUAL_EXCEL_SYNC_DEQUEUED', {
      date: request.date,
      queuePosition,
      waitedMs: Date.now() - queuedAt,
      remaining: queuedManualSyncCount
    });
    if (quitting) throw new Error('Ứng dụng đang đóng, không thể tiếp tục cập nhật Excel.');
    return syncAllProcessExcel(request);
  });

  manualSyncTail = task.catch(() => undefined);
  return task;
}

function sendRenderer(channel, payload) {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return;
  mainWindow.webContents.send(channel, payload);
}

async function runAutomaticSync() {
  if (!currentToken || quitting) return;
  if (Date.now() - lastSuccessfulSyncAt < SYNC_INTERVAL_MS - 5_000) return;
  if (syncRunning || queuedManualSyncCount > 0) {
    await writeLog('INFO', 'AUTO_EXCEL_SYNC_SKIPPED_BUSY', {
      syncRunning,
      queuedManualSyncCount
    });
    return;
  }
  try {
    const result = await syncAllProcessExcel({ date: getDateParts().date, source: 'automatic' });
    if (result?.success) lastSuccessfulSyncAt = Date.now();
    sendRenderer('ktc-excel-sync-result', result);
  } catch (error) {
    await writeLog('ERROR', 'AUTO_SYNC_FAILED', normalizeError(error));
    sendRenderer('ktc-excel-sync-error', { message: error.message });
  }
}

function stopAutomaticSync() {
  if (syncTimer) clearInterval(syncTimer);
  syncTimer = null;
}

function normalizeAccessToken(token) {
  const value = typeof token === 'string' ? token.trim() : '';
  return value.replace(/^Bearer\s+/i, '').trim();
}

function configureAutomaticSync(token) {
  currentToken = normalizeAccessToken(token);
  stopAutomaticSync();
  if (!currentToken || !AUTO_EXCEL_SYNC_ENABLED) return;
  syncTimer = setInterval(() => void runAutomaticSync(), SYNC_INTERVAL_MS);
  syncTimer.unref?.();
}

const FRONTEND_INDEX = path.join(__dirname, '..', 'frontend', 'dist', 'index.html');

function isAllowedNavigation(targetUrl) {
  try {
    const url = new URL(targetUrl);
    return url.protocol === 'file:' || url.protocol === 'about:' || url.protocol === 'data:';
  } catch {
    return false;
  }
}


async function readRendererAccessToken() {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return '';

  const token = await mainWindow.webContents.executeJavaScript(
    `(() => {
      try {
        const keys = ['accessToken', 'access_token', 'token'];
        for (const key of keys) {
          const value = localStorage.getItem(key);
          if (typeof value === 'string' && value.trim()) return value.trim();
        }

        const authValue = localStorage.getItem('auth');
        if (authValue) {
          try {
            const auth = JSON.parse(authValue);
            const nested = auth?.accessToken || auth?.access_token || auth?.token || '';
            if (typeof nested === 'string' && nested.trim()) return nested.trim();
          } catch (error) {
            console.warn("[KTC] Invalid stored auth payload", error?.message || error);
          }
        }

        return '';
      } catch {
        return '';
      }
    })()`,
    true
  );

  return normalizeAccessToken(token);
}

function decodeJwtPayload(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) return null;
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function isUsableAccessToken(token, clockSkewSeconds = 20) {
  const normalized = normalizeAccessToken(token);
  if (!normalized) return false;
  const payload = decodeJwtPayload(normalized);
  if (!payload || !Number.isFinite(Number(payload.exp))) return true;
  return Number(payload.exp) * 1000 > Date.now() + clockSkewSeconds * 1000;
}

async function resolveDesktopToken(candidateToken) {
  // Renderer là nguồn ưu tiên vì frontend cập nhật localStorage ngay sau /auth/refresh.
  const rendererToken = await readRendererAccessToken();
  if (isUsableAccessToken(rendererToken)) return normalizeAccessToken(rendererToken);

  const supplied = normalizeAccessToken(candidateToken);
  if (isUsableAccessToken(supplied)) return supplied;

  const cached = normalizeAccessToken(currentToken);
  if (isUsableAccessToken(cached)) return cached;
  return '';
}

async function waitForUsableRendererToken(previousToken = '', timeoutMs = 8_000) {
  const previous = normalizeAccessToken(previousToken);
  const deadline = Date.now() + timeoutMs;
  do {
    const token = await resolveDesktopToken('');
    if (token && token !== previous && isUsableAccessToken(token)) return token;
    await wait(250);
  } while (Date.now() < deadline);
  const fallback = await resolveDesktopToken('');
  return isUsableAccessToken(fallback) ? fallback : '';
}

async function authenticatedFetch(url, options = {}) {
  const execute = async (token) => fetchWithTimeout(url, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`
    }
  });

  let token = await waitForUsableRendererToken('', 8_000);
  if (!token) {
    throw new Error('Không tìm thấy phiên đăng nhập hợp lệ. Hãy chờ đăng nhập được làm mới rồi thử lại.');
  }
  currentToken = token;

  let lastError = null;
  for (let attempt = 1; attempt <= RETRY_COUNT; attempt += 1) {
    try {
      let response = await execute(token);
      if (response.status === 401) {
        await writeLog('WARN', 'AUTH_TOKEN_401_WAITING_FOR_REFRESH', { url, attempt });
        sendRenderer('ktc-auth-refresh-required', { reason: 'excel-request-401' });
        const refreshed = await waitForUsableRendererToken(token, 10_000);
        if (refreshed && refreshed !== token) {
          token = refreshed;
          currentToken = refreshed;
          await writeLog('INFO', 'AUTH_TOKEN_REFRESHED_FOR_EXCEL', { url, attempt });
          response = await execute(refreshed);
        }
      }

      const retryableStatus = [408, 425, 429, 500, 502, 503, 504].includes(response.status);
      if (!retryableStatus || attempt === RETRY_COUNT) return response;

      await writeLog('WARN', 'API_RETRYABLE_RESPONSE', {
        url, status: response.status, attempt, maxAttempts: RETRY_COUNT
      });
      await wait(RETRY_DELAY_MS * attempt);
    } catch (error) {
      lastError = error;
      await writeLog('WARN', 'API_FETCH_RETRY', {
        url, attempt, maxAttempts: RETRY_COUNT, ...normalizeError(error)
      });
      if (attempt === RETRY_COUNT) throw error;
      await wait(RETRY_DELAY_MS * attempt);
    }
  }
  throw lastError || new Error('Không thể kết nối backend KTC.');
}

async function discoverRendererToken() {
  try {
    const normalized = await readRendererAccessToken();
    if (normalized !== currentToken) {
      configureAutomaticSync(normalized);
      await writeLog('INFO', normalized ? 'TOKEN_DISCOVERED_AUTO_SYNC_ENABLED' : 'TOKEN_REMOVED_AUTO_SYNC_DISABLED');
    }
    return normalized;
  } catch (error) {
    await writeLog('WARN', 'TOKEN_DISCOVERY_FAILED', normalizeError(error));
    return '';
  }
}

function startTokenDiscovery() {
  if (tokenDiscoveryTimer) clearInterval(tokenDiscoveryTimer);
  void discoverRendererToken();
  tokenDiscoveryTimer = setInterval(() => void discoverRendererToken(), 5000);
  tokenDiscoveryTimer.unref?.();
}

function scheduleSyncAfterApprovedMutation(url, statusCode) {
  if (statusCode < 200 || statusCode >= 300) return;
  const lower = String(url || '').toLowerCase();
  const changesApprovedData = lower.includes('/production-temp/approve')
    || lower.includes('/production/approve')
    || (lower.includes('/production/') && (lower.includes('/update') || lower.includes('/reports')));
  if (!changesApprovedData) return;
  const now = Date.now();
  if (now - lastApprovedMutationAt < 1500) return;
  lastApprovedMutationAt = now;
  void writeLog('INFO', 'APPROVED_MUTATION_AUTO_SYNC_SKIPPED', { url: lower });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: '#f3f6fb',
    autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedNavigation(url)) {
      void mainWindow.loadURL(url);
    } else if (/^https?:\/\//i.test(url)) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url)) {
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    }
  });

  mainWindow.webContents.on('did-fail-load', async (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) return;
    await writeLog('ERROR', 'RENDERER_LOAD_FAILED', { errorCode, errorDescription, validatedURL });
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const safeDescription = String(errorDescription || 'Không thể kết nối tới hệ thống')
      .replace(/[&<>\"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;' }[c] || c));
    const safeUrl = String(validatedURL || FRONTEND_INDEX)
      .replace(/[&<>\"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;' }[c] || c));
    const html = `<!doctype html><html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>KTC Production Control</title><style>body{margin:0;font-family:Segoe UI,Arial,sans-serif;background:#f3f6fb;color:#172033;display:grid;place-items:center;min-height:100vh}.card{width:min(560px,calc(100% - 40px));padding:36px;border:1px solid #dce5f1;border-radius:24px;background:#fff;box-shadow:0 20px 55px rgba(30,53,84,.12);text-align:center}.logo{width:68px;height:68px;margin:auto;display:grid;place-items:center;border-radius:18px;background:linear-gradient(145deg,#2464c8,#164a9d);color:#fff;font-weight:900}h1{margin:20px 0 10px;color:#183a6a}p{color:#64748b;line-height:1.6}.meta{font-size:12px;color:#94a3b8;word-break:break-word}button{min-height:46px;padding:0 20px;border:0;border-radius:13px;background:#2563eb;color:#fff;font-weight:800;cursor:pointer}</style></head><body><main class="card"><div class="logo">KTC</div><h1>Không thể kết nối hệ thống</h1><p>Hãy kiểm tra Internet hoặc chờ dịch vụ Render khởi động.</p><p class="meta">${safeDescription}<br>${safeUrl}</p><button onclick="location.reload()">Thử lại</button></main></body></html>`;
    await mainWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(html)}`);
    mainWindow.show();
  });

  mainWindow.webContents.on('did-finish-load', () => {
    startTokenDiscovery();
  });

  mainWindow.webContents.session.webRequest.onCompleted({ urls: [`${API_BASE_URL}/*`] }, (details) => {
    scheduleSyncAfterApprovedMutation(details.url, details.statusCode);
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    void writeLog('ERROR', 'RENDER_PROCESS_GONE', details);
  });
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    void writeLog(level >= 3 ? 'ERROR' : 'INFO', 'RENDERER', { message, line, sourceId });
  });
  mainWindow.on('closed', () => { mainWindow = null; });

  void mainWindow.loadFile(FRONTEND_INDEX).catch(async (error) => {
    await writeLog('ERROR', 'LOAD_FILE_FAILED', { frontendIndex: FRONTEND_INDEX, ...normalizeError(error) });
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show();
  });
}

ipcMain.on('ktc-network-online', () => {
  void writeLog('INFO', 'NETWORK_ONLINE_AUTO_SYNC_SKIPPED');
});

async function handleManualExcelSync(payload) {
  const request = payload || {};
  const date = request.date || getDateParts().date;
  const startedAt = Date.now();
  await writeLog('INFO', 'MANUAL_EXCEL_SYNC_REQUESTED', { date });
  try {
    const token = await waitForUsableRendererToken(request.token || '', 8_000);
    if (!token) {
      throw new Error('Chưa tìm thấy phiên đăng nhập. Hãy đăng xuất, đăng nhập lại rồi thử cập nhật Excel.');
    }
    await writeLog('INFO', 'MANUAL_EXCEL_TOKEN_RESOLVED', { date });
    const result = await enqueueManualExcelSync({ date, source: 'manual', token });
    await writeLog(result?.success ? 'INFO' : 'WARN', 'MANUAL_EXCEL_SYNC_FINISHED', {
      date,
      success: Boolean(result?.success),
      skipped: Boolean(result?.skipped),
      code: result?.code || null,
      elapsedMs: Date.now() - startedAt
    });
    return result;
  } catch (error) {
    await writeLog('ERROR', 'MANUAL_EXCEL_SYNC_FAILED', {
      date,
      elapsedMs: Date.now() - startedAt,
      ...normalizeError(error)
    });
    throw error;
  }
}

ipcMain.handle('ktc-save-excel', (_event, payload) => handleManualExcelSync(payload));
ipcMain.handle('ktc-sync-all-excel', (_event, payload) => handleManualExcelSync(payload));
ipcMain.handle('ktc-configure-auto-sync', async (_event, token) => {
  const resolvedToken = await resolveDesktopToken(token);
  configureAutomaticSync(resolvedToken);
  return {
    success: true,
    enabled: Boolean(currentToken),
    intervalMinutes: SYNC_INTERVAL_MS / 60000,
    exportRoot: getExportRoot()
  };
});
ipcMain.handle('ktc-open-export-folder', async (_event, date) => {
  const selected = date || getDateParts().date;
  assertDate(selected);
  const [year] = selected.split('-');
  const folder = path.join(getExportRoot(), year);
  await fs.mkdir(folder, { recursive: true });
  const error = await shell.openPath(folder);
  if (error) throw new Error(error);
  return folder;
});
ipcMain.handle('ktc-get-export-folder', async (_event, date) => {
  const selected = date || getDateParts().date;
  assertDate(selected);
  const [year] = selected.split('-');
  const folder = path.join(getExportRoot(), year);
  await fs.mkdir(folder, { recursive: true });
  return folder;
});
ipcMain.handle('ktc-open-log-folder', async () => {
  const folder = path.join(app.getPath('userData'), 'logs');
  await fs.mkdir(folder, { recursive: true });
  const error = await shell.openPath(folder);
  if (error) throw new Error(error);
  return folder;
});

app.whenReady().then(async () => {
  try {
    await session.defaultSession.clearCache();
    await session.defaultSession.clearStorageData({ storages: ['serviceworkers', 'cachestorage'] });
  } catch (error) {
    await writeLog('WARN', 'CACHE_CLEAR_FAILED', normalizeError(error));
  }
  await writeLog('INFO', 'APP_READY', {
    version: app.getVersion(),
    exportRoot: getExportRoot(),
    userData: app.getPath('userData'),
    api: API_BASE_URL
  });
  createWindow();
  powerMonitor.on('resume', () => {
    void writeLog('INFO', 'SYSTEM_RESUME_AUTO_SYNC_SKIPPED');
  });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
app.on('before-quit', () => {
  quitting = true;
  if (tokenDiscoveryTimer) clearInterval(tokenDiscoveryTimer);
  tokenDiscoveryTimer = null;
  currentToken = '';
  stopAutomaticSync();
});
