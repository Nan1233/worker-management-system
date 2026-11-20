'use strict';

// Electron window lifecycle, navigation controls and renderer diagnostics.
function createDesktopWindowFactory({
  BrowserWindow, shell, writeLog, normalizeError, API_BASE_URL, FRONTEND_INDEX,
  OFFLINE_INDEX, preloadPath, iconPath, isAllowedNavigation, isSafeExternalUrl,
  startTokenDiscovery, scheduleSyncAfterApprovedMutation, setMainWindow,
}) {
function createWindow() {
  global.__KTC_STARTUP_MARK__?.('window_create_begin');
  const windowStart = process.hrtime.bigint();
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 620,
    // Show the window immediately so a slow remote frontend cannot leave the app invisible.
    show: true,
    backgroundColor: '#f3f6fb',
    autoHideMenuBar: true,
    icon: iconPath,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  });

  setMainWindow(mainWindow);
  mainWindow.once('ready-to-show', () => {
    global.__KTC_STARTUP_MARK__?.('window_ready_to_show');
    void writeLog('INFO', 'WINDOW_READY_TO_SHOW', {
      elapsedMs: Number((process.hrtime.bigint() - windowStart) / 1000000n),
      processUptimeMs: Math.round(process.uptime() * 1000)
    });
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
    global.__KTC_STARTUP_MARK__?.('frontend_loaded');
    // Distinguish slow Windows portable extraction from frontend/network latency.
    void writeLog('INFO', 'FRONTEND_DID_FINISH_LOAD', {
      elapsedSinceWindowMs: Number((process.hrtime.bigint() - windowStart) / 1000000n),
      processUptimeMs: Math.round(process.uptime() * 1000)
    });
    startTokenDiscovery();
  });

  mainWindow.webContents.session.webRequest.onCompleted({ urls: [`${API_BASE_URL}/*`] }, (details) => {
    scheduleSyncAfterApprovedMutation(details.url, details.statusCode);
  });

  global.__KTC_STARTUP_MARK__?.('window_created');
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    void writeLog('ERROR', 'RENDER_PROCESS_GONE', details);
  });
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    void writeLog(level >= 3 ? 'ERROR' : 'INFO', 'RENDERER', { message, line, sourceId });
  });
  mainWindow.on('closed', () => { setMainWindow(null); });

  void mainWindow.loadFile(FRONTEND_INDEX).catch(async (error) => {
    await writeLog('ERROR', 'LOAD_FILE_FAILED', { frontendIndex: FRONTEND_INDEX, ...normalizeError(error) });
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show();
  });
}


  return { createWindow };
}
module.exports = { createDesktopWindowFactory };
