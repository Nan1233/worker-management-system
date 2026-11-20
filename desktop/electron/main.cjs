const { app, BrowserWindow, ipcMain, shell, session, powerMonitor, dialog } = require('electron');
const { registerFolderIpc } = require('./ipc/folderIpc.cjs');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { buildCompanyExcelLocal, buildProcessExcelLocal } = require('./companyExcelLocal.cjs');
const { parseDownloadFileName, normalizeProcessInfo } = require('./excelDownloadMetadata.cjs');
const { createDesktopLogger, normalizeError } = require('./desktopLog.cjs');
const { normalizeAccessToken, isUsableAccessToken } = require('./authToken.cjs');
const { PROCESS_SHEETS } = require('./monthlyWorkbookLocal.cjs');
const { buildWorkerSplit: buildSplitMonthlyWorkbooksLocal } = require('./excelExportContractPatch.v6.cjs');
const { getCompanyMonthTarget } = require('./excelDualLayout.cjs');
const { cleanupLegacyMonthlyLayout } = require('./excelLegacyCleanup.cjs');
const { createExcelAtomicWriter } = require('./excelAtomicFileWriter.cjs');
const { createExcelFileDiscovery } = require('./excelFileDiscovery.cjs');
const { createProcessReportExport } = require('./processReportExport.cjs');
const { createExcelDbSyncController } = require('./excelDbSyncController.cjs');
const { createMonthlyDesktopExport } = require('./monthlyDesktopExport.cjs');
const { createExcelApiClient } = require('./excelApiClient.cjs');
const { createRendererAuthClient } = require('./rendererAuthClient.cjs');
const { createDesktopWindowFactory } = require('./desktopWindow.cjs');
const { createDesktopExcelIpcHandlers } = require('./desktopExcelIpcHandlers.cjs');
const { getDesktopDataRoot, getDocumentsRoot } = require('./platformPaths.cjs');
const { readExcelChanges } = require('./excelDbSync.cjs');
const { createExcelBackupRetention } = require('./excelBackupRetention.cjs');
const {
  isTrustedRendererNavigation,
  isTrustedIpcSender,
  assertTrustedIpcSender,
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


const API_BASE_URL = String(
  process.env.KTC_API_URL || 'https://worker-management-system-2-5jqv.onrender.com/api'
).trim().replace(/\/+$/, '');
if (!/\/api$/i.test(API_BASE_URL)) {
  throw new Error('KTC_API_URL must be the full API base URL ending in /api');
}
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

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const {
  fetchWithTimeout, fetchCompanyData,
} = createExcelApiClient({
  API_BASE_URL, REQUEST_TIMEOUT_MS, DOWNLOAD_RETRY_COUNT, RETRY_DELAY_MS,
  authenticatedFetch: (...args) => authenticatedFetch(...args), writeLog, normalizeError, parseDownloadFileName,
  normalizeProcessInfo, getExportRoot, safeFileName, safeFolderName,
  getCompanyMonthTarget, buildCompanyExcelLocal, getProcessExportPath,
  getAppPath: () => app.getAppPath(), wait,
});


const { compactCompletedBackupMonths, pruneExcelBackupRetention } = createExcelBackupRetention({ writeLog });

const { atomicOverwrite } = createExcelAtomicWriter({
  writeLog, getExportRoot, getDocumentsRoot, safeFolderName,
  assertDate, pruneExcelBackupRetention, normalizeError, RETRY_COUNT, RETRY_DELAY_MS, wait
});

const { logPendingFiles, listExcelFiles } = createExcelFileDiscovery({ writeLog, normalizeError });

const { syncProcessReportsFirst } = createProcessReportExport({
  normalizeProcessInfo, writeLog, buildProcessExcelLocal, getProcessExportPath,
  atomicOverwrite, normalizeError, getAppPath: () => app.getAppPath(),
});

const { postExcelChanges, previewEditedExcelFilesToDb, syncEditedExcelFilesToDb } = createExcelDbSyncController({
  authenticatedFetch: (...args) => authenticatedFetch(...args), API_BASE_URL, listExcelFiles, getExportRoot, readExcelChanges,
  writeLog, normalizeError, waitForUsableRendererToken: (...args) => waitForUsableRendererToken(...args), sendRenderer,
  enqueueManualExcelSync, isQuitting: () => quitting, isSyncRunning: () => syncRunning,
});

function startExcelDbSyncWatcher() {
  // Excel -> DB chỉ chạy khi người quản lý bấm nút và xác nhận.
  // Không tự đẩy dữ liệu khi người dùng đang sửa dở workbook.
  if (excelDbSyncTimer) clearInterval(excelDbSyncTimer);
  excelDbSyncTimer = null;
}

const { performSyncSingleMonth } = createMonthlyDesktopExport({
  writeLog, getExportRoot, logPendingFiles,
  waitForUsableRendererToken: (...args) => waitForUsableRendererToken(...args),
  getCurrentToken: () => currentToken, setCurrentToken: (value) => { currentToken = value; },
  fetchCompanyData, buildSplitMonthlyWorkbooksLocal, getAppPath: () => app.getAppPath(),
  PROCESS_SHEETS, safeFileName, atomicOverwrite, normalizeError, cleanupLegacyMonthlyLayout,
});

async function performSync({ date, source }) {
  const startedAt = Date.now();
  assertDate(date);
  const [year] = date.split('-');
  const root = getExportRoot();
  const monthResults = [];
  await writeLog('INFO', 'YEARLY_APPROVED_EXPORT_START', {
    year, source, monthsRequested: 12, policy: 'ALL_APPROVED_REPORTS_BY_MONTH'
  });

  for (let month = 1; month <= 12; month += 1) {
    const monthText = String(month).padStart(2, '0');
    const monthDate = `${year}-${monthText}-01`;
    try {
      const result = await performSyncSingleMonth({ date: monthDate, source: `${source}:yearly` });
      monthResults.push({
        yearMonth: `${year}-${monthText}`,
        success: result.success === true,
        skipped: result.skipped === true,
        code: result.code || null,
        files: Array.isArray(result.files) ? result.files : [],
        message: result.message || null
      });
    } catch (error) {
      monthResults.push({
        yearMonth: `${year}-${monthText}`,
        success: false,
        skipped: false,
        error: error.message,
        files: []
      });
      await writeLog('ERROR', 'YEARLY_APPROVED_EXPORT_MONTH_FAILED', {
        year, yearMonth: `${year}-${monthText}`, source, ...normalizeError(error)
      });
    }
  }

  const exportedMonths = monthResults.filter((item) => !item.skipped && item.files.length > 0);
  const skippedMonths = monthResults.filter((item) => item.skipped);
  const failedMonths = monthResults.filter((item) => !item.success && !item.skipped);
  const files = monthResults.flatMap((item) => item.files.map((file) => ({
    ...file, yearMonth: item.yearMonth
  })));
  const hasExportedData = exportedMonths.length > 0;
  const success = hasExportedData && failedMonths.length === 0 &&
    exportedMonths.every((item) => item.success);
  const result = {
    success,
    partialSuccess: hasExportedData && failedMonths.length > 0,
    skipped: !hasExportedData && failedMonths.length === 0,
    code: !hasExportedData && failedMonths.length === 0 ? 'NO_APPROVED_DATA_FOR_YEAR' : undefined,
    message: success
      ? `Đã cập nhật báo cáo approved năm ${year}: ${exportedMonths.length} tháng có dữ liệu; bỏ qua ${skippedMonths.length} tháng trống.`
      : hasExportedData
        ? `Đã xuất một phần báo cáo năm ${year}; có ${failedMonths.length} tháng lỗi. Kiểm tra desktop.log.`
        : failedMonths.length
          ? `Không thể xuất báo cáo năm ${year}; có ${failedMonths.length} tháng lỗi.`
          : `Năm ${year} chưa có báo cáo approved để xuất.`,
    date,
    year,
    files,
    months: monthResults.map(({ files: _files, ...item }) => item),
    rootFolder: root,
    savedAt: new Date().toISOString(),
    elapsedMs: Date.now() - startedAt,
    excelEngine: 'desktop-local',
    backendRole: 'approved-data-only'
  };
  await writeLog(success ? 'INFO' : 'WARN', 'YEARLY_APPROVED_EXPORT_FINISH', {
    year, source, success, exportedMonthCount: exportedMonths.length,
    skippedMonthCount: skippedMonths.length, failedMonthCount: failedMonths.length,
    fileCount: files.length
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


const {
  readRendererAccessToken, resolveDesktopToken, waitForUsableRendererToken, authenticatedFetch,
} = createRendererAuthClient({
  getWindow: () => mainWindow, getCurrentToken: () => currentToken,
  setCurrentToken: (value) => { currentToken = value; }, normalizeAccessToken,
  isUsableAccessToken, isRetrySafeMethod, fetchWithTimeout, writeLog, normalizeError,
  sendRenderer, wait, RETRY_COUNT, RETRY_DELAY_MS,
});

async function discoverRendererToken() {
  try {
    const normalized = await readRendererAccessToken();
    // An empty storage read is not proof of logout: the remote frontend may
    // be reloading or refreshing its auth state. Never erase a valid token
    // mid-export. Expiry is still enforced by isUsableAccessToken.
    if (!normalized && isUsableAccessToken(currentToken)) return currentToken;
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
  // Avoid continuously executing JavaScript against the renderer while it is
  // loading or the user is interacting with the application.
  tokenDiscoveryTimer = setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isLoading()) return;
    void discoverRendererToken();
  }, 15000);
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

const { createWindow } = createDesktopWindowFactory({
  BrowserWindow, shell, writeLog, normalizeError, API_BASE_URL, FRONTEND_INDEX,
  OFFLINE_INDEX, preloadPath: path.join(__dirname, 'preload.cjs'),
  iconPath: path.join(__dirname, '..', 'assets', 'icon.png'),
  isAllowedNavigation, isSafeExternalUrl, startTokenDiscovery,
  scheduleSyncAfterApprovedMutation, setMainWindow: (window) => { mainWindow = window; },
});

// Keep file, sync and diagnostic handlers callable only by the current KTC
// main frame on the configured trusted origin or packaged index/offline page.
function protectedDesktopIpc(handler) {
  return (event, ...args) => {
    assertTrustedIpcSender(event, mainWindow?.webContents, TRUSTED_RENDERER_FILES);
    return handler(event, ...args);
  };
}

ipcMain.on('ktc-network-online', (event) => {
  if (!isTrustedIpcSender(event, mainWindow?.webContents, TRUSTED_RENDERER_FILES)) return;
  void writeLog('INFO', 'NETWORK_ONLINE_AUTO_SYNC_SKIPPED');
});

const {
  handleManualExcelSync, handlePreviewExcelDbSync, handleApplyExcelDbSync,
  handlePreviewReportImport, handleApplyReportImport,
} = createDesktopExcelIpcHandlers({
  getDateParts, writeLog, waitForUsableRendererToken, enqueueManualExcelSync,
  normalizeError, previewEditedExcelFilesToDb, syncEditedExcelFilesToDb,
  setCurrentToken: (value) => { currentToken = value; },
  dialog, getMainWindow: () => mainWindow, assertImportFileSize,
  readExcelChanges, reportImportPreviewGuard, postExcelChanges,
});

ipcMain.handle('ktc-preview-excel-db-sync', protectedDesktopIpc((_event, payload) => handlePreviewExcelDbSync(payload)));
ipcMain.handle('ktc-preview-report-import', protectedDesktopIpc((_event, payload) => handlePreviewReportImport(payload)));
ipcMain.handle('ktc-apply-report-import', protectedDesktopIpc((_event, payload) => handleApplyReportImport(payload)));
ipcMain.handle('ktc-apply-excel-db-sync', protectedDesktopIpc((_event, payload) => handleApplyExcelDbSync(payload)));
ipcMain.handle('ktc-save-excel', protectedDesktopIpc((_event, payload) => handleManualExcelSync(payload)));
ipcMain.handle('ktc-sync-all-excel', protectedDesktopIpc((_event, payload) => handleManualExcelSync(payload)));
ipcMain.handle('ktc-configure-auto-sync', protectedDesktopIpc(async (_event, token) => {
  const resolvedToken = await resolveDesktopToken(token);
  configureAutomaticSync(resolvedToken);
  return {
    success: true,
    enabled: Boolean(currentToken),
    intervalMinutes: SYNC_INTERVAL_MS / 60000,
    exportRoot: getExportRoot()
  };
}));
registerFolderIpc({ ipcMain, protectedDesktopIpc, getDateParts, assertDate, getExportRoot, path, fs, shell, app });

ipcMain.on('ktc-frontend-painted', (event) => {
  // Only our own window may mark first paint; no renderer data is accepted.
  if (mainWindow && !mainWindow.isDestroyed() && isTrustedIpcSender(event, mainWindow.webContents, TRUSTED_RENDERER_FILES)) {
    global.__KTC_STARTUP_MARK__?.('frontend_painted');
  }
});

ipcMain.handle('ktc-startup-diagnostics', protectedDesktopIpc(() => {
  // Immutable, restricted metadata: never return log contents or auth data.
  const diagnostics = global.__KTC_STARTUP_DIAGNOSTICS__ || {};
  return {
    schema: 1,
    startedAt: String(diagnostics.startedAt || ''),
    version: app.getVersion(),
    portable: Boolean(diagnostics.portable),
    bundledFrontend: Boolean(diagnostics.bundledFrontend),
    points: { ...(diagnostics.points || {}) },
    platform: process.platform,
    arch: process.arch
  };
}));

app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  // Do not block window creation on disk/cache operations. The remote frontend
  // already requests fresh content with no-cache headers in launcher.cjs.
  createWindow();
  void writeLog('INFO', 'APP_READY', {
    version: app.getVersion(),
    // Never call getExportRoot() on the Electron UI startup path: it performs
    // synchronous SMB mkdir/access, potentially blocking the event loop for
    // tens of seconds on slow/offline company NAS connections.
    exportRootConfigured: process.env.KTC_EXPORT_ROOT || '',
    userData: app.getPath('userData'),
    api: API_BASE_URL
  });
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
