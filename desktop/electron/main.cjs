const { app, BrowserWindow, ipcMain, shell, session, powerMonitor, dialog } = require('electron');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { buildCompanyExcelLocal, buildProcessExcelLocal } = require('./companyExcelLocal.cjs');
const { createDesktopLogger, normalizeError } = require('./desktopLog.cjs');
const { normalizeAccessToken, isUsableAccessToken } = require('./authToken.cjs');
const { buildSplitMonthlyWorkbooksLocal, PROCESS_SHEETS } = require('./monthlyWorkbookLocal.cjs');
const { getCompanyMonthTarget } = require('./excelDualLayout.cjs');
const { getDesktopDataRoot, getDocumentsRoot } = require('./platformPaths.cjs');
const { readExcelChanges } = require('./excelDbSync.cjs');
const {
  isTrustedRendererNavigation,
  isSafeExternalUrl,
  isRetrySafeMethod,
  assertImportFileSize,
  ReportImportPreviewGuard,
} = require('./securityPolicy.cjs');
const {
  getDateParts,
  assertDate,
  safeFolderName,
  safeFileName,
  getExportRoot,
  getProcessExportPath,
  cleanupMisplacedCompanyFiles,
} = require('./excelPaths.cjs');

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
let excelDbSyncTimer = null;
let excelDbSyncRunning = false;
const excelDbSyncState = new Map();
const reportImportPreviewGuard = new ReportImportPreviewGuard();

const appDataRoot = getDesktopDataRoot();
app.setPath('userData', path.join(appDataRoot, 'UserData'));
app.setPath('cache', path.join(appDataRoot, 'Cache'));
app.commandLine.appendSwitch('disk-cache-dir', path.join(appDataRoot, 'Cache'));
app.commandLine.appendSwitch('gpu-cache-dir', path.join(appDataRoot, 'GPUCache'));

const writeLog = createDesktopLogger(() => app.getPath('userData'));

// Production desktop must have only one active instance. Multiple instances can
// race on the same Excel files and local cache folders.
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    void writeLog('INFO', 'SECOND_INSTANCE_BLOCKED');
  });
}

process.on('uncaughtException', (error) => void writeLog('ERROR', 'UNCAUGHT_EXCEPTION', normalizeError(error)));
process.on('unhandledRejection', (error) => void writeLog('ERROR', 'UNHANDLED_REJECTION', normalizeError(error)));

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


function backupDateFromName(fileName) {
  const match = String(fileName || '').match(/_(\d{4})-(\d{2})-(\d{2})\.xlsx$/i);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function backupDayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
function backupMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
}
function backupWeekKey(date) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - day);
  return backupDayKey(copy);
}

async function pruneExcelBackupRetention(processBackupRoot, policy = { daily: 14, weekly: 8, monthly: 12 }) {
  const files = [];
  const walk = async (folder) => {
    let entries = [];
    try { entries = await fs.readdir(folder, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = path.join(folder, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) {
        const date = backupDateFromName(entry.name);
        if (date) files.push({ full, name: entry.name, date });
      }
    }
  };
  await walk(processBackupRoot);
  files.sort((a,b) => b.date - a.date || b.name.localeCompare(a.name));
  const keep = new Set();
  const keepBy = (keyFn, limit) => {
    const seen = new Set();
    for (const item of files) {
      const key = keyFn(item.date);
      if (seen.has(key) || seen.size >= limit) continue;
      seen.add(key); keep.add(item.full);
    }
  };
  keepBy(backupDayKey, policy.daily);
  keepBy(backupWeekKey, policy.weekly);
  keepBy(backupMonthKey, policy.monthly);
  let removed = 0;
  for (const item of files) {
    if (keep.has(item.full)) continue;
    await fs.rm(item.full, { force: true });
    removed += 1;
  }
  if (removed) await writeLog('INFO', 'EXCEL_BACKUP_RETENTION_PRUNED', { processBackupRoot, removed, policy });
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
      getDocumentsRoot(),
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

    await fs.mkdir(monthFolder, { recursive: true });

    try {
      await fs.copyFile(filePath, backupPath, fsSync.constants.COPYFILE_EXCL);
      await writeLog('INFO', 'EXCEL_DAILY_BACKUP_CREATED', { filePath, backupPath, syncDate });
      await pruneExcelBackupRetention(processBackupRoot);
      return backupPath;
    } catch (error) {
      if (error?.code === 'EEXIST') {
        await writeLog('INFO', 'EXCEL_DAILY_BACKUP_ALREADY_EXISTS', { filePath, backupPath, syncDate });
        await pruneExcelBackupRetention(processBackupRoot);
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


async function listExcelFiles(rootFolder) {
  const result = [];
  const walk = async (folder) => {
    let entries = [];
    try { entries = await fs.readdir(folder, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = path.join(folder, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.xlsx') && !entry.name.endsWith('.pending.xlsx')) result.push(full);
    }
  };
  await walk(rootFolder);
  return result;
}

async function postExcelChanges(changes) {
  const response = await authenticatedFetch(`${API_BASE_URL}/production/excel-sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ changes })
  });
  if (response.status === 401 || response.status === 403) {
    const error = new Error('Tài khoản hiện tại không có quyền đồng bộ chỉnh sửa Excel về DB.');
    error.code = 'EXCEL_DB_SYNC_FORBIDDEN';
    throw error;
  }
  const payload = await response.json().catch(() => ({}));
  if (![200, 207].includes(response.status)) throw new Error(payload.message || `Đồng bộ Excel về DB lỗi HTTP ${response.status}`);
  return payload;
}


async function previewEditedExcelFilesToDb({ yearMonth = '' } = {}) {
  const files = await listExcelFiles(getExportRoot());
  const changes = [];
  const helperUpdatedFiles = [];
  const helperUpdateErrors = [];
  for (const filePath of files) {
    let parsed;
    try {
      parsed = await readExcelChanges(filePath);
    } catch (error) {
      await writeLog('WARN', 'EXCEL_DB_PREVIEW_READ_SKIPPED', { filePath, ...normalizeError(error) });
      continue;
    }
    if (!parsed?.managed) continue;
    if (parsed.helperUpdated) helperUpdatedFiles.push(path.basename(filePath));
    if (parsed.helperUpdateError) helperUpdateErrors.push({ file: path.basename(filePath), message: parsed.helperUpdateError });
    if (!parsed.changes?.length) continue;
    if (yearMonth && parsed.yearMonth && parsed.yearMonth !== yearMonth) continue;
    for (const change of parsed.changes) {
      changes.push({
        ...change,
        filePath,
        yearMonth: parsed.yearMonth || null
      });
    }
  }
  return {
    detected: changes.length,
    changes,
    yearMonth: yearMonth || null,
    helperUpdatedFiles,
    helperUpdateErrors
  };
}

async function syncEditedExcelFilesToDb({ source = 'watcher', yearMonth = '' } = {}) {
  if (excelDbSyncRunning || quitting) return { skipped: true };
  const token = await waitForUsableRendererToken('', 2_000);
  if (!token) return { skipped: true, reason: 'no-token' };
  excelDbSyncRunning = true;
  try {
    const files = await listExcelFiles(getExportRoot());
    let detected = 0;
    let succeeded = 0;
    let failed = 0;
    const changedMonths = new Set();
    for (const filePath of files) {
      let stat;
      try { stat = await fs.stat(filePath); } catch { continue; }
      const state = excelDbSyncState.get(filePath) || { mtimeMs: 0, versions: new Map() };
      if (Math.abs(Number(state.mtimeMs || 0) - Number(stat.mtimeMs || 0)) < 1) continue;
      let parsed;
      try {
        parsed = await readExcelChanges(filePath);
      } catch (error) {
        // File đang mở/đang save có thể tạm thời không đọc được; vòng sau sẽ thử lại.
        await writeLog('WARN', 'EXCEL_DB_SYNC_READ_SKIPPED', { filePath, source, ...normalizeError(error) });
        continue;
      }
      if (!parsed.managed) { excelDbSyncState.set(filePath, { ...state, mtimeMs: stat.mtimeMs }); continue; }
      if (yearMonth && parsed.yearMonth && parsed.yearMonth !== yearMonth) continue;
      if (!parsed.changes.length) { excelDbSyncState.set(filePath, { ...state, mtimeMs: stat.mtimeMs }); continue; }
      for (const change of parsed.changes) {
        if (state.versions?.has(change.id)) change.expected_updated_at = state.versions.get(change.id);
      }
      detected += parsed.changes.length;
      if (/^\d{4}-\d{2}$/.test(String(parsed.yearMonth || ''))) changedMonths.add(parsed.yearMonth);
      for (let index = 0; index < parsed.changes.length; index += 100) {
        const chunk = parsed.changes.slice(index, index + 100);
        try {
          const result = await postExcelChanges(chunk);
          succeeded += Number(result.succeeded || 0);
          failed += Number(result.failed || 0);
          for (const item of result.results || []) {
            if (item.success && item.updated_at) state.versions.set(Number(item.id), item.updated_at);
            if (!item.success) await writeLog('WARN', 'EXCEL_DB_SYNC_ROW_FAILED', { filePath, reportId: item.id, code: item.code, message: item.message });
          }
        } catch (error) {
          failed += chunk.length;
          await writeLog('ERROR', 'EXCEL_DB_SYNC_BATCH_FAILED', { filePath, source, count: chunk.length, ...normalizeError(error) });
          if (error.code === 'EXCEL_DB_SYNC_FORBIDDEN') return { detected, succeeded, failed, forbidden: true };
        }
      }
      excelDbSyncState.set(filePath, { mtimeMs: stat.mtimeMs, versions: state.versions });
    }
    if (detected > 0) {
      await writeLog('INFO', 'EXCEL_DB_SYNC_FINISH', { source, detected, succeeded, failed, changedMonths: [...changedMonths] });
      if (source === 'watcher') sendRenderer('ktc-excel-db-sync-result', { detected, succeeded, failed });
      if (succeeded > 0 && !syncRunning && source === 'watcher') {
        for (const yearMonth of changedMonths) {
          void enqueueManualExcelSync({ date: `${yearMonth}-01`, source: 'excel-db-rebuild' }).catch((error) =>
            writeLog('ERROR', 'EXCEL_DB_REBUILD_FAILED', { yearMonth, ...normalizeError(error) })
          );
        }
      }
    }
    return { detected, succeeded, failed, changedMonths: [...changedMonths] };
  } finally {
    excelDbSyncRunning = false;
  }
}

function startExcelDbSyncWatcher() {
  // Excel -> DB chỉ chạy khi người quản lý bấm nút và xác nhận.
  // Không tự đẩy dữ liệu khi người dùng đang sửa dở workbook.
  if (excelDbSyncTimer) clearInterval(excelDbSyncTimer);
  excelDbSyncTimer = null;
}

async function performSync({ date, source }) {
  const startedAt = Date.now();
  await writeLog('INFO', 'SYNC_START', { source, date, mode: 'split-monthly-workbooks' });

  const root = getExportRoot();
  await fs.mkdir(root, { recursive: true });
  await logPendingFiles(root);

  const token = await waitForUsableRendererToken('', 8_000);
  if (!token) throw new Error('Chưa đăng nhập hoặc phiên đăng nhập chưa được làm mới.');
  currentToken = token;

  const files = [];
  try {
    // Không tự đẩy Excel -> DB khi đang xuất. Nếu workbook có chỉnh sửa chưa sync,
    // dừng lại để người quản lý xem trước và chủ động xác nhận cập nhật DB.
    const pendingExcelEdits = await previewEditedExcelFilesToDb({ yearMonth: String(date).slice(0, 7) });
    if (pendingExcelEdits.detected > 0 && source !== 'excel-db-rebuild') {
      const error = new Error(`Có ${pendingExcelEdits.detected} báo cáo đã sửa trong Excel nhưng chưa cập nhật DB. Hãy bấm “Cập nhật DB từ Excel” và xác nhận trước khi cập nhật Excel từ DB.`);
      error.code = 'EXCEL_UNSYNCED_CHANGES';
      throw error;
    }
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
    await fs.mkdir(folder, { recursive: true });

    await writeLog('INFO', 'MONTHLY_SPLIT_WORKBOOKS_START', {
      date,
      folder,
      expectedFileCount: Object.keys(PROCESS_SHEETS).length + 1
    });

    const built = await buildSplitMonthlyWorkbooksLocal({
      appPath: app.getAppPath(),
      date,
      payload: companyData
    });

    // File 00: tổng hợp chung + đối chiếu dữ liệu DB.
    const summaryFilePath = path.join(folder, built.summary.fileName);
    const summaryWrite = await atomicOverwrite(summaryFilePath, built.summary.buffer, date);
    files.push({
      category: 'MONTHLY_SUMMARY', processId: -1, processCode: 'ALL',
      processName: 'Tổng hợp sản xuất tháng', fileName: built.summary.fileName,
      filePath: summaryFilePath, folder, size: built.summary.buffer.length,
      saved: summaryWrite.saved, pendingPath: summaryWrite.pendingPath,
      backupPath: summaryWrite.backupPath, success: true,
      formulaReplacementCount: built.summary.formulaReplacementCount
    });

    // 9 công đoạn: mỗi công đoạn một file riêng, kể cả tháng chưa có dữ liệu.
    for (const processBuilt of built.processes) {
      const filePath = path.join(folder, processBuilt.fileName);
      const writeResult = await atomicOverwrite(filePath, processBuilt.buffer, date);
      files.push({
        category: 'MONTHLY_PROCESS',
        processId: -1,
        processCode: processBuilt.processCode,
        processName: processBuilt.processName,
        fileName: processBuilt.fileName,
        filePath,
        folder,
        size: processBuilt.buffer.length,
        saved: writeResult.saved,
        pendingPath: writeResult.pendingPath,
        backupPath: writeResult.backupPath,
        success: true,
        sheetResult: processBuilt.result,
        formulaReplacementCount: processBuilt.formulaReplacementCount
      });
    }

    await writeLog('INFO', 'MONTHLY_SPLIT_WORKBOOKS_UPDATED', {
      date,
      folder,
      fileCount: files.length,
      files: files.map((file) => ({
        processCode: file.processCode,
        fileName: file.fileName,
        saved: file.saved,
        pendingPath: file.pendingPath || null
      }))
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

  const expectedFileCount = Object.keys(PROCESS_SHEETS).length + 1;
  const success = files.length === expectedFileCount && files.every((file) => file.success === true);
  const result = {
    success,
    partialSuccess: false,
    message: success
      ? `Đã cập nhật ${expectedFileCount} file Excel tháng: 1 file tổng hợp và ${Object.keys(PROCESS_SHEETS).length} file công đoạn.`
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

function configureAutomaticSync(token) {
  currentToken = normalizeAccessToken(token);
  stopAutomaticSync();
  if (!currentToken || !AUTO_EXCEL_SYNC_ENABLED) return;
  syncTimer = setInterval(() => void runAutomaticSync(), SYNC_INTERVAL_MS);
  syncTimer.unref?.();
}

const FRONTEND_INDEX = path.join(__dirname, '..', 'frontend', 'dist', 'index.html');
const OFFLINE_INDEX = path.join(__dirname, '..', 'assets', 'offline.html');
const TRUSTED_RENDERER_FILES = [FRONTEND_INDEX, OFFLINE_INDEX];

function isAllowedNavigation(targetUrl) {
  return isTrustedRendererNavigation(targetUrl, TRUSTED_RENDERER_FILES);
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
  const requestMethod = String(options.method || 'GET').toUpperCase();
  const retrySafe = isRetrySafeMethod(requestMethod);
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

      const retryableStatus = retrySafe && [408, 425, 429, 500, 502, 503, 504].includes(response.status);
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
      if (!retrySafe || attempt === RETRY_COUNT) throw error;
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
  if (excelDbSyncTimer) clearInterval(excelDbSyncTimer);
  excelDbSyncTimer = null;
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
    minWidth: 900,
    minHeight: 620,
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
    } else if (isSafeExternalUrl(url)) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url)) {
      event.preventDefault();
      if (isSafeExternalUrl(url)) void shell.openExternal(url);
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
    await writeLog('WARN', 'RENDERER_OFFLINE_PAGE', { safeDescription, safeUrl });
    await mainWindow.loadFile(OFFLINE_INDEX);
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


async function handlePreviewExcelDbSync(payload = {}) {
  const token = await waitForUsableRendererToken(payload.token || '', 8_000);
  if (!token) throw new Error('Chưa tìm thấy phiên đăng nhập. Hãy đăng nhập lại rồi thử.');
  currentToken = token;
  const yearMonth = /^\d{4}-\d{2}$/.test(String(payload.yearMonth || '')) ? String(payload.yearMonth) : '';
  const result = await previewEditedExcelFilesToDb({ yearMonth });
  await writeLog('INFO', 'MANUAL_EXCEL_DB_PREVIEW', { yearMonth, detected: result.detected });
  return result;
}

async function handleApplyExcelDbSync(payload = {}) {
  const token = await waitForUsableRendererToken(payload.token || '', 8_000);
  if (!token) throw new Error('Chưa tìm thấy phiên đăng nhập. Hãy đăng nhập lại rồi thử.');
  currentToken = token;
  const yearMonth = /^\d{4}-\d{2}$/.test(String(payload.yearMonth || '')) ? String(payload.yearMonth) : '';
  const result = await syncEditedExcelFilesToDb({ source: 'manual-db-sync', yearMonth });
  const months = Array.isArray(result.changedMonths) ? result.changedMonths : [];
  for (const month of months) {
    if (yearMonth && month !== yearMonth) continue;
    await enqueueManualExcelSync({ date: `${month}-01`, source: 'excel-db-rebuild', token }).catch((error) =>
      writeLog('ERROR', 'EXCEL_DB_REBUILD_FAILED', { yearMonth: month, ...normalizeError(error) })
    );
  }
  await writeLog(result.failed ? 'WARN' : 'INFO', 'MANUAL_EXCEL_DB_APPLY_FINISHED', {
    yearMonth, detected: result.detected, succeeded: result.succeeded, failed: result.failed
  });
  return result;
}


async function handlePreviewReportImport(payload = {}) {
  const token = await waitForUsableRendererToken(payload.token || '', 8_000);
  if (!token) throw new Error('Chưa tìm thấy phiên đăng nhập. Hãy đăng nhập lại rồi thử.');
  currentToken = token;
  const picked = await dialog.showOpenDialog(mainWindow, {
    title: 'Import báo cáo Excel vào KTC',
    properties: ['openFile'],
    filters: [{ name: 'Excel', extensions: ['xlsx'] }]
  });
  if (picked.canceled || !picked.filePaths?.[0]) return { canceled: true, detected: 0, changes: [] };
  const filePath = path.resolve(picked.filePaths[0]);
  const stat = await fs.stat(filePath);
  assertImportFileSize(stat);
  const parsed = await readExcelChanges(filePath);
  if (!parsed?.managed) {
    const error = new Error('File này không phải workbook KTC có metadata đồng bộ. Hãy dùng file được xuất từ KTC hoặc template import KTC.');
    error.code = 'KTC_IMPORT_UNMANAGED_WORKBOOK';
    throw error;
  }
  const changes = Array.isArray(parsed.changes) ? parsed.changes : [];
  reportImportPreviewGuard.remember(filePath);
  await writeLog('INFO', 'REPORT_IMPORT_PREVIEW', {
    filePath,
    yearMonth: parsed.yearMonth || null,
    detected: changes.length,
    creates: changes.filter((item) => item?.create === true).length,
    updates: changes.filter((item) => item?.create !== true).length
  });
  return {
    canceled: false,
    filePath,
    fileName: path.basename(filePath),
    yearMonth: parsed.yearMonth || null,
    detected: changes.length,
    creates: changes.filter((item) => item?.create === true).length,
    updates: changes.filter((item) => item?.create !== true).length,
    changes
  };
}

async function handleApplyReportImport(payload = {}) {
  const token = await waitForUsableRendererToken(payload.token || '', 8_000);
  if (!token) throw new Error('Chưa tìm thấy phiên đăng nhập. Hãy đăng nhập lại rồi thử.');
  currentToken = token;
  const filePath = reportImportPreviewGuard.assertAllowed(payload.filePath);
  if (!filePath.toLowerCase().endsWith('.xlsx') || !fsSync.existsSync(filePath)) throw new Error('File import không còn tồn tại.');
  const stat = await fs.stat(filePath);
  assertImportFileSize(stat);
  const parsed = await readExcelChanges(filePath);
  if (!parsed?.managed) throw new Error('File import không còn đúng contract KTC. Hãy xuất lại file từ DB trước.');
  const changes = Array.isArray(parsed.changes) ? parsed.changes : [];
  if (!changes.length) return { detected: 0, succeeded: 0, failed: 0, filePath, yearMonth: parsed.yearMonth || null };
  const payloadResult = await postExcelChanges(changes.map((change) => ({
    ...change,
    source: { ...(change.source || {}), file: path.basename(filePath), import_center: true }
  })));
  const succeeded = Number(payloadResult.succeeded || 0);
  const failed = Number(payloadResult.failed || 0);
  if (parsed.yearMonth && /^\d{4}-\d{2}$/.test(parsed.yearMonth)) {
    await enqueueManualExcelSync({ date: `${parsed.yearMonth}-01`, source: 'report-import-rebuild', token }).catch((error) =>
      writeLog('ERROR', 'REPORT_IMPORT_REBUILD_FAILED', { yearMonth: parsed.yearMonth, ...normalizeError(error) })
    );
  }
  if (failed === 0) reportImportPreviewGuard.consume(filePath);
  await writeLog(failed ? 'WARN' : 'INFO', 'REPORT_IMPORT_APPLY', {
    filePath,
    yearMonth: parsed.yearMonth || null,
    detected: changes.length,
    succeeded,
    failed
  });
  return { detected: changes.length, succeeded, failed, results: payloadResult.results || [], filePath, yearMonth: parsed.yearMonth || null };
}

ipcMain.handle('ktc-preview-excel-db-sync', (_event, payload) => handlePreviewExcelDbSync(payload));
ipcMain.handle('ktc-preview-report-import', (_event, payload) => handlePreviewReportImport(payload));
ipcMain.handle('ktc-apply-report-import', (_event, payload) => handleApplyReportImport(payload));
ipcMain.handle('ktc-apply-excel-db-sync', (_event, payload) => handleApplyExcelDbSync(payload));
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
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
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
  startExcelDbSyncWatcher();
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
  if (excelDbSyncTimer) clearInterval(excelDbSyncTimer);
  excelDbSyncTimer = null;
  tokenDiscoveryTimer = null;
  currentToken = '';
  stopAutomaticSync();
});
