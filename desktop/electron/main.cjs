const { app, BrowserWindow, ipcMain, shell, session, powerMonitor, dialog } = require('electron');
const { registerFolderIpc } = require('./ipc/folderIpc.cjs');
const fs = require('node:fs/promises');
const path = require('node:path');
const { buildCompanyExcelLocal } = require('./companyExcelLocal.cjs');
const { parseDownloadFileName, normalizeProcessInfo } = require('./excelDownloadMetadata.cjs');
const { createDesktopLogger, normalizeError } = require('./desktopLog.cjs');
const { normalizeAccessToken, isUsableAccessToken } = require('./authToken.cjs');
const { PROCESS_SHEETS } = require('./monthlyWorkbookLocal.cjs');
const { buildWorkerSplit: buildSplitMonthlyWorkbooksLocal } = require('./excelExportContractPatch.v6.cjs');
const { getCompanyMonthTarget } = require('./excelDualLayout.cjs');
const { cleanupLegacyMonthlyLayout } = require('./excelLegacyCleanup.cjs');
const { createExcelAtomicWriter } = require('./excelAtomicFileWriter.cjs');
const { createExcelFileDiscovery } = require('./excelFileDiscovery.cjs');
const { createExcelDbSyncController } = require('./excelDbSyncController.cjs');
const { createMonthlyDesktopExport } = require('./monthlyDesktopExport.cjs');
const { createExcelApiClient } = require('./excelApiClient.cjs');
const { createRendererAuthClient } = require('./rendererAuthClient.cjs');
const { createDesktopWindowFactory } = require('./desktopWindow.cjs');
const { createDesktopExcelIpcHandlers } = require('./desktopExcelIpcHandlers.cjs');
const { createDesktopSyncCoordinator } = require('./desktopSyncCoordinator.cjs');
const { resolveDesktopDeploymentProfile } = require('./deploymentProfile.cjs');
const { createDesktopRendererMonitoring } = require('./desktopRendererMonitoring.cjs');
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
} = require('./excelPaths.cjs');


const API_BASE_URL = String(
  process.env.KTC_API_URL || resolveDesktopDeploymentProfile(process.env.KTC_DESKTOP_ENV || 'test').apiUrl
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
let currentToken = '';
let quitting = false;
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


const { pruneExcelBackupRetention } = createExcelBackupRetention({ writeLog });

const { atomicOverwrite } = createExcelAtomicWriter({
  writeLog, getExportRoot, getDocumentsRoot, safeFolderName,
  assertDate, pruneExcelBackupRetention, normalizeError, RETRY_COUNT, RETRY_DELAY_MS, wait
});

const { logPendingFiles, listExcelFiles } = createExcelFileDiscovery({ writeLog, normalizeError });



const { postExcelChanges, previewEditedExcelFilesToDb, syncEditedExcelFilesToDb } = createExcelDbSyncController({
  authenticatedFetch: (...args) => authenticatedFetch(...args), API_BASE_URL, listExcelFiles, getExportRoot, readExcelChanges,
  writeLog, normalizeError, waitForUsableRendererToken: (...args) => waitForUsableRendererToken(...args), sendRenderer,
  enqueueManualExcelSync: (...args) => enqueueManualExcelSync(...args), isQuitting: () => quitting, isSyncRunning: () => isSyncRunning(),
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

const {
  enqueueManualExcelSync, configureAutomaticSync, stopAutomaticSync, isSyncRunning,
} = createDesktopSyncCoordinator({
  assertDate, getExportRoot, writeLog, normalizeError, performSyncSingleMonth,
  waitForUsableRendererToken: (...args) => waitForUsableRendererToken(...args),
  getCurrentToken: () => currentToken, setCurrentToken: (value) => { currentToken = value; },
  isQuitting: () => quitting, normalizeAccessToken, SYNC_INTERVAL_MS,
  AUTO_EXCEL_SYNC_ENABLED, getDateParts, sendRenderer,
});

function sendRenderer(channel, payload) {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return;
  mainWindow.webContents.send(channel, payload);
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

const { startTokenDiscovery, stopTokenDiscovery, scheduleSyncAfterApprovedMutation } =
  createDesktopRendererMonitoring({
    readRendererAccessToken, isUsableAccessToken,
    getCurrentToken: () => currentToken, configureAutomaticSync,
    writeLog, normalizeError, getMainWindow: () => mainWindow,
    stopExcelDbSyncWatcher: startExcelDbSyncWatcher,
  });

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
  stopTokenDiscovery();
  startExcelDbSyncWatcher();
  currentToken = '';
  stopAutomaticSync();
});
