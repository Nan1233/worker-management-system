const { app, BrowserWindow, ipcMain, shell, session } = require('electron');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const API_BASE_URL = String(
  process.env.KTC_API_URL || 'https://worker-management-system-2-5jqv.onrender.com/api'
).replace(/\/+$/, '');
const SYNC_INTERVAL_MS = Math.max(60_000, Number(process.env.KTC_SYNC_INTERVAL_MS) || 5 * 60 * 1000);
const REQUEST_TIMEOUT_MS = Math.max(30_000, Number(process.env.KTC_REQUEST_TIMEOUT_MS) || 120_000);
const RETRY_DELAY_MS = 1200;
const RETRY_COUNT = 4;
const DOWNLOAD_RETRY_COUNT = 3;

let mainWindow = null;
let syncTimer = null;
let currentToken = '';
let syncRunning = false;
let syncQueued = false;
let quitting = false;
let tokenDiscoveryTimer = null;
let lastApprovedMutationAt = 0;

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

async function writeLog(level, message, details) {
  const serialized = details === undefined ? '' : ` ${typeof details === 'string' ? details : JSON.stringify(details)}`;
  const line = `[${nowText()}] [${level}] ${message}${serialized}\n`;
  try {
    const folder = path.join(app.getPath('userData'), 'logs');
    await fs.mkdir(folder, { recursive: true });
    await fs.appendFile(path.join(folder, 'desktop.log'), line, 'utf8');
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

async function getProcessExportPath(date, processName, serverFileName) {
  assertDate(date);
  const [year, month] = date.split('-');
  const processFolder = safeFolderName(processName);
  const folder = path.join(getExportRoot(), year, processFolder);
  await fs.mkdir(folder, { recursive: true });
  return {
    folder,
    filePath: path.join(folder, safeFileName(serverFileName, `Bao-cao-${month}-${year}.xlsx`))
  };
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error(`Máy chủ phản hồi quá ${Math.round(REQUEST_TIMEOUT_MS / 1000)} giây.`);
    throw error;
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
    return (await response.text()) || `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

async function fetchProcesses(token, date) {
  const response = await fetchWithTimeout(
    `${API_BASE_URL}/reports/export-excel/processes?date=${encodeURIComponent(date)}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
  );
  if (response.status === 401 || response.status === 403) throw new Error('Phiên đăng nhập đã hết hạn hoặc không có quyền xuất Excel.');
  if (!response.ok) throw new Error(await readApiError(response));
  const payload = await response.json();
  return Array.isArray(payload.data) ? payload.data : [];
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

async function downloadProcessExcel(token, date, processInfo) {
  const response = await fetchWithTimeout(`${API_BASE_URL}/reports/export-excel/process`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/json'
    },
    body: JSON.stringify({ date, processId: Number(processInfo.id) })
  });
  if (response.status === 401 || response.status === 403) throw new Error('Phiên đăng nhập đã hết hạn hoặc không có quyền xuất Excel.');
  if (!response.ok) throw new Error(await readApiError(response));

  const contentType = response.headers.get('content-type') || '';
  const buffer = Buffer.from(await response.arrayBuffer());
  const isZip = buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
  if (!contentType.includes('spreadsheetml') || !isZip) {
    throw new Error(`Backend không trả file Excel hợp lệ cho công đoạn ${processInfo.processName || processInfo.id}.`);
  }

  const [year, month] = date.split('-');
  const fallback = `Bao-cao-${safeFolderName(processInfo.processCode || processInfo.processName)}-${month}-${year}.xlsx`;
  const fileName = parseDownloadFileName(response, fallback);
  const { folder, filePath } = await getProcessExportPath(date, processInfo.processName, fileName);
  return { buffer, folder, filePath, fileName };
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function atomicOverwrite(filePath, buffer) {
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(temporaryPath, buffer, { flag: 'wx' });

  let lastError;
  for (let attempt = 1; attempt <= RETRY_COUNT; attempt += 1) {
    try {
      await fs.rm(filePath, { force: true });
      await fs.rename(temporaryPath, filePath);
      return { saved: true, pendingPath: null };
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
  await writeLog('WARN', 'FILE_LOCKED_PENDING_CREATED', { filePath, pendingPath, code: lastError?.code });
  return { saved: false, pendingPath };
}

async function applyPendingFiles(rootFolder) {
  let entries;
  try { entries = await fs.readdir(rootFolder, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    const fullPath = path.join(rootFolder, entry.name);
    if (entry.isDirectory()) {
      await applyPendingFiles(fullPath);
    } else if (entry.isFile() && entry.name.endsWith('.pending.xlsx')) {
      const finalPath = fullPath.slice(0, -'.pending.xlsx'.length);
      try {
        await fs.rm(finalPath, { force: true });
        await fs.rename(fullPath, finalPath);
        await writeLog('INFO', 'PENDING_FILE_APPLIED', { finalPath });
      } catch (error) {
        if (!['EPERM', 'EACCES', 'EBUSY'].includes(error.code)) {
          await writeLog('WARN', 'PENDING_FILE_APPLY_FAILED', { finalPath, ...normalizeError(error) });
        }
      }
    }
  }
}

async function performSync({ token, date, source }) {
  const startedAt = Date.now();
  await writeLog('INFO', 'SYNC_START', { source, date });
  const root = getExportRoot();
  await fs.mkdir(root, { recursive: true });
  await applyPendingFiles(root);

  const files = [];

  // Luôn tải file tổng hợp bằng đúng API mà Chrome đang sử dụng.
  // Đây là bản nguồn đầy đủ của toàn bộ báo cáo đã duyệt trong tháng.
  try {
    const consolidated = await downloadConsolidatedExcel(token, date);
    const writeResult = await atomicOverwrite(consolidated.filePath, consolidated.buffer);
    files.push({
      processId: 0,
      processCode: 'ALL',
      processName: 'Tổng hợp',
      reportCount: null,
      fileName: consolidated.fileName,
      filePath: consolidated.filePath,
      folder: consolidated.folder,
      size: consolidated.buffer.length,
      saved: writeResult.saved,
      pendingPath: writeResult.pendingPath,
      success: true,
      consolidated: true
    });
    await writeLog('INFO', 'CONSOLIDATED_EXCEL_UPDATED', { filePath: consolidated.filePath, saved: writeResult.saved });
  } catch (error) {
    files.push({ processId: 0, processName: 'Tổng hợp', success: false, consolidated: true, error: error.message });
    await writeLog('ERROR', 'CONSOLIDATED_SYNC_FAILED', normalizeError(error));
  }

  // Các API tách công đoạn là phần bổ sung. Backend cũ hoặc Render chưa cập nhật
  // không được làm hỏng file Tổng hợp đã tải thành công.
  let processes = [];
  try {
    processes = await fetchProcesses(token, date);
  } catch (error) {
    await writeLog('WARN', 'PROCESS_LIST_UNAVAILABLE_CONTINUE_WITH_CONSOLIDATED', normalizeError(error));
    files.push({
      processId: -1,
      processName: 'Tách theo công đoạn',
      success: false,
      optional: true,
      error: error.message
    });
  }

  for (const processInfo of processes) {
    try {
      const downloaded = await downloadProcessExcel(token, date, processInfo);
      const writeResult = await atomicOverwrite(downloaded.filePath, downloaded.buffer);
      files.push({
        processId: Number(processInfo.id),
        processCode: processInfo.processCode || '',
        processName: processInfo.processName || `Công đoạn ${processInfo.id}`,
        reportCount: Number(processInfo.reportCount) || 0,
        fileName: downloaded.fileName,
        filePath: downloaded.filePath,
        folder: downloaded.folder,
        size: downloaded.buffer.length,
        saved: writeResult.saved,
        pendingPath: writeResult.pendingPath,
        success: true
      });
      await writeLog('INFO', 'MONTHLY_EXCEL_UPDATED', { filePath: downloaded.filePath, saved: writeResult.saved });
    } catch (error) {
      files.push({
        processId: Number(processInfo.id),
        processName: processInfo.processName || `Công đoạn ${processInfo.id}`,
        success: false,
        optional: true,
        error: error.message
      });
      await writeLog('ERROR', 'PROCESS_SYNC_FAILED', {
        processId: processInfo.id,
        processName: processInfo.processName,
        ...normalizeError(error)
      });
    }
  }

  const consolidatedFile = files.find((file) => file.consolidated === true);
  const requiredSuccess = Boolean(consolidatedFile?.success);
  const optionalFailures = files.filter((file) => file.optional && file.success === false);
  const result = {
    success: requiredSuccess,
    partialSuccess: requiredSuccess && optionalFailures.length > 0,
    message: requiredSuccess
      ? (optionalFailures.length > 0
          ? 'Đã cập nhật Excel tổng hợp; một số file công đoạn chưa cập nhật được.'
          : 'Đã cập nhật đầy đủ các file Excel.')
      : 'Không thể cập nhật file Excel tổng hợp.',
    date,
    files,
    rootFolder: root,
    savedAt: new Date().toISOString(),
    elapsedMs: Date.now() - startedAt
  };
  await writeLog('INFO', 'SYNC_FINISH', {
    source, date, fileCount: files.length, success: result.success, elapsedMs: result.elapsedMs
  });
  return result;
}

async function syncAllProcessExcel({ token, date, source = 'manual' } = {}) {
  const normalizedToken = typeof token === 'string' ? token.trim() : '';
  if (!normalizedToken) throw new Error('Chưa đăng nhập hoặc thiếu token.');
  assertDate(date);

  if (syncRunning) {
    syncQueued = true;
    return { success: true, skipped: true, reason: 'sync-running', files: [] };
  }

  syncRunning = true;
  try {
    let result = await performSync({ token: normalizedToken, date, source });
    while (syncQueued && currentToken && !quitting) {
      syncQueued = false;
      result = await performSync({ token: currentToken, date: getDateParts().date, source: 'queued' });
    }
    return result;
  } finally {
    syncRunning = false;
  }
}

function sendRenderer(channel, payload) {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return;
  mainWindow.webContents.send(channel, payload);
}

async function runAutomaticSync() {
  if (!currentToken || quitting) return;
  try {
    const result = await syncAllProcessExcel({ token: currentToken, date: getDateParts().date, source: 'automatic' });
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
  const nextToken = typeof token === 'string' ? token.trim() : '';
  const tokenChanged = nextToken !== currentToken;
  currentToken = nextToken;
  stopAutomaticSync();
  if (!currentToken) return;
  if (tokenChanged || !syncRunning) void runAutomaticSync();
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


async function discoverRendererToken() {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return '';
  try {
    const token = await mainWindow.webContents.executeJavaScript(
      `(() => { try { return localStorage.getItem('token') || ''; } catch { return ''; } })()`,
      true
    );
    const normalized = typeof token === 'string' ? token.trim() : '';
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
  setTimeout(() => void runAutomaticSync(), 1200);
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

ipcMain.handle('ktc-save-excel', (_event, payload) => syncAllProcessExcel({ ...(payload || {}), source: 'manual' }));
ipcMain.handle('ktc-sync-all-excel', (_event, payload) => syncAllProcessExcel({ ...(payload || {}), source: 'manual' }));
ipcMain.handle('ktc-configure-auto-sync', (_event, token) => {
  configureAutomaticSync(token);
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
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on('before-quit', () => {
  quitting = true;
  if (tokenDiscoveryTimer) clearInterval(tokenDiscoveryTimer);
  tokenDiscoveryTimer = null;
  currentToken = '';
  stopAutomaticSync();
});
