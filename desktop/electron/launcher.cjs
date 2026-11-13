const { app, ipcMain, dialog, BrowserWindow, session, net } = require('electron');
const startupClock = process.hrtime.bigint();
const startupElapsedMs = () => Number((process.hrtime.bigint() - startupClock) / 1000000n);
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

// Excel export: use the company NAS when reachable; otherwise save locally
// under the current Windows user's Documents\KTC\Bao cao san xuat folder.
const DEFAULT_EXPORT_ROOT = '\\\\KTCNAS\\Public\\3. SẢN XUẤT-製造\\Linh tinh';
const LEGACY_NETWORK_EXPORT_ROOT = DEFAULT_EXPORT_ROOT;
const LOCAL_FALLBACK_EXPORT_ROOT = path.join(os.homedir(), 'Documents', 'KTC', 'Bao cao san xuat');
const LEGACY_LOCAL_EXPORT_ROOT = LOCAL_FALLBACK_EXPORT_ROOT;
// Set the persistent data path before any config or launcher log path is resolved.
const { getDesktopDataRoot } = require('./platformPaths.cjs');
// Electron requires the target directory to exist, including on a clean PC.
const persistentUserData = path.join(getDesktopDataRoot(), 'UserData');
fs.mkdirSync(persistentUserData, { recursive: true });
app.setPath('userData', persistentUserData);
const CONFIG_FILE = path.join(app.getPath('userData'), 'excel-export-config.json');
const DESKTOP_ICON = path.join(__dirname, '..', 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png');

if (process.platform === 'win32') {
  app.setAppUserModelId('vn.ktc.productioncontrol');
}

// The packaged metadata selects the environment. The default package metadata
// is TEST; the production electron-builder profile overrides it explicitly.
const { resolveDesktopDeploymentProfile } = require('./deploymentProfile.cjs');
const desktopPackage = require('../package.json');
const desktopDeployment = resolveDesktopDeploymentProfile(
  desktopPackage.ktcDeploymentEnvironment || process.env.KTC_DESKTOP_ENV || 'test'
);
const FRONTEND_URL = desktopDeployment.frontendUrl;
process.env.KTC_API_URL = desktopDeployment.apiUrl;
process.env.KTC_WEB_ORIGIN = FRONTEND_URL;

const bundledFrontendEnabled = desktopPackage.ktcBundledFrontend === true;
if (bundledFrontendEnabled && desktopDeployment.environment !== 'test') {
  throw new Error('Bundled frontend is restricted to TEST until production validation is complete');
}

let launcherLogWriter = null;
function writeLauncherLog(level, event, payload = {}) {
  try {
    const userData = app.getPath('userData');
    const logPath = path.join(userData, 'desktop-launcher.log');
    const line = JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      event,
      ...payload,
    }) + '\n';
    launcherLogWriter = (launcherLogWriter || Promise.resolve())
      .then(() => fsp.mkdir(userData, { recursive: true }))
      .then(() => fsp.appendFile(logPath, line, 'utf8'))
      .catch(() => {});
    return launcherLogWriter;
  } catch (_) {
    return Promise.resolve();
  }
}

// Observe fatal startup failures without replacing Node's default crash behavior.
// Never log environment variables, renderer storage, auth tokens or full URLs.
// Per-launch marker: distinguishes first start from subsequent restarts in the append-only log.
void writeLauncherLog('INFO', 'STARTUP_PROCESS_BEGIN', { elapsedMs: startupElapsedMs(), portable: Boolean(process.env.PORTABLE_EXECUTABLE_FILE), bundledFrontend: bundledFrontendEnabled });

function safeCrashSummary(reason) {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  const sanitize = (value) => String(value || '')
    .replace(/(authorization|bearer|token|password|cookie|secret)\\s*[:=]\\s*[^\\s,;]+/gi, '$1=[REDACTED]')
    .slice(0, 1500);
  return { name: sanitize(error.name), message: sanitize(error.message), code: sanitize(error.code || '') };
}

process.on('uncaughtExceptionMonitor', (error, origin) => {
  void writeLauncherLog('ERROR', 'MAIN_UNCAUGHT_EXCEPTION', {
    origin: String(origin || ''), ...safeCrashSummary(error)
  });
});
process.on('unhandledRejection', (reason) => {
  void writeLauncherLog('ERROR', 'MAIN_UNHANDLED_REJECTION', safeCrashSummary(reason));
});
app.on('child-process-gone', (_event, details) => {
  void writeLauncherLog('ERROR', 'ELECTRON_CHILD_PROCESS_GONE', {
    type: String(details?.type || ''), reason: String(details?.reason || ''),
    exitCode: Number(details?.exitCode || 0)
  });
});

app.on('browser-window-created', (_event, window) => {
  try {
    if (process.platform === 'win32') window.setIcon(DESKTOP_ICON);
  } catch (_) {}

  // Load the frontend belonging to the packaged deployment profile.
  const originalWindowLoadFile = window.loadFile.bind(window);
  window.loadFile = async function loadRemoteProfileFrontend(filePath, ...args) {
    const resolved = path.resolve(String(filePath || ''));
    const fileName = path.basename(resolved).toLowerCase();
    if (fileName === 'index.html') {
      // Avoid delaying the first navigation for cache cleanup. The request
      // headers below still ask the remote frontend for fresh content.
      void writeLauncherLog('INFO', 'REMOTE_FE_NAVIGATION_START', { elapsedMs: startupElapsedMs() });
      await window.loadURL(FRONTEND_URL);
      return window;
    }
    return originalWindowLoadFile(filePath, ...args);
  };

  window.webContents.on('did-navigate', (_navigateEvent, url) => {
    if (url === FRONTEND_URL || url.startsWith(`${FRONTEND_URL}/`)) {
      void writeLauncherLog('INFO', 'REMOTE_FE_LOADED', { url, elapsedMs: startupElapsedMs() });
    }
  });

  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    if (validatedURL === FRONTEND_URL || validatedURL.startsWith(`${FRONTEND_URL}/`)) {
      void writeLauncherLog('ERROR', 'REMOTE_FE_LOAD_FAILED', {
        errorCode,
        errorDescription,
        validatedURL,
        elapsedMs: startupElapsedMs(),
      });
    }
  });
});

// The order-dependent Excel patches are now loaded by excelRuntime.cjs on the
// first actual Excel operation; startup is no longer blocked by ExcelJS.
void writeLauncherLog('INFO', 'STARTUP_EXCEL_PATCHES_DEFERRED', { elapsedMs: startupElapsedMs() });

function normalizeExportRoot(value) {
  const raw = String(value || '').trim();
  if (!raw) return DEFAULT_EXPORT_ROOT;
  if (/^\\\\/.test(raw)) return raw.replace(/[\\/]+$/g, '');
  return path.resolve(raw);
}

function isLegacyNetworkExportRoot(value) {
  const normalized = String(value || '').trim().replace(/[\\/]+$/g, '').toLowerCase();
  const legacy = LEGACY_NETWORK_EXPORT_ROOT.replace(/[\\/]+$/g, '').toLowerCase();
  return normalized === legacy || normalized.endsWith('\\linh tinh') || normalized.endsWith('/linh tinh');
}

function readConfiguredExportRoot() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return DEFAULT_EXPORT_ROOT;
    const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    const configured = String(parsed?.exportRoot || '').trim();
    if (!configured) return DEFAULT_EXPORT_ROOT;

    const normalizedConfigured = configured.replace(/[\\/]+$/g, '').toLowerCase();
    const normalizedLegacy = LEGACY_LOCAL_EXPORT_ROOT.replace(/[\\/]+$/g, '').toLowerCase();
    if (normalizedConfigured === normalizedLegacy) return DEFAULT_EXPORT_ROOT;

    // Older builds may have saved only the relative folder name "Linh tinh".
    // It must mean the company NAS folder for this desktop installation.
    if (/^linh\s*tinh$/i.test(configured) || isLegacyNetworkExportRoot(configured)) {
      return DEFAULT_EXPORT_ROOT;
    }

    return normalizeExportRoot(configured);
  } catch {
    return DEFAULT_EXPORT_ROOT;
  }
}

function resolveWritableExportRoot(configuredRoot) {
  const configured = normalizeExportRoot(configuredRoot);
  const isNas = /^\\\\/.test(configured);
  if (!isNas) return { root: configured, fallback: false };

  try {
    // mkdir/access is the actual availability check. A stale mapped/configured
    // NAS path must never block the Excel export when the machine is offline.
    fs.mkdirSync(configured, { recursive: true });
    fs.accessSync(configured, fs.constants.R_OK | fs.constants.W_OK);
    return { root: configured, fallback: false };
  } catch (error) {
    const localRoot = LOCAL_FALLBACK_EXPORT_ROOT;
    try {
      fs.mkdirSync(localRoot, { recursive: true });
      fs.accessSync(localRoot, fs.constants.R_OK | fs.constants.W_OK);
      return {
        root: localRoot,
        fallback: true,
        reason: error?.code || error?.message || 'NAS_UNAVAILABLE'
      };
    } catch (localError) {
      return {
        root: configured,
        fallback: false,
        reason: `NAS_UNAVAILABLE_LOCAL_FALLBACK_FAILED:${localError?.code || localError?.message || 'UNKNOWN'}`
      };
    }
  }
}

async function saveConfiguredExportRoot(exportRoot) {
  const normalized = normalizeExportRoot(exportRoot);
  await fsp.mkdir(path.dirname(CONFIG_FILE), { recursive: true });
  await fsp.writeFile(CONFIG_FILE, JSON.stringify({ exportRoot: normalized }, null, 2), 'utf8');
  process.env.KTC_EXPORT_ROOT = normalized;
  return normalized;
}

function safeExportFileName(value, fallback) {
  const candidate = String(value || fallback)
    .replace(/[<>:\"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  return candidate || fallback;
}

function getBangkokDateParts(dateValue = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const [year, month, day] = formatter.format(dateValue).split('-');
  return { year, month, day };
}

async function ensureCurrentMonthlyFolder() {
  // Re-resolve every time the folder is prepared so a NAS disconnect/reconnect
  // after app startup is handled without restarting the desktop app.
  const resolved = resolveWritableExportRoot(process.env.KTC_EXPORT_ROOT || readConfiguredExportRoot());
  process.env.KTC_EXPORT_ROOT = resolved.root;
  const { year, month } = getBangkokDateParts();
  const yearFolder = path.join(resolved.root, year);
  const monthFolder = path.join(yearFolder, month);
  await fsp.mkdir(monthFolder, { recursive: true });
  await writeLauncherLog('INFO', 'EXCEL_MONTH_FOLDER_READY', {
    root: resolved.root,
    configuredRoot: process.env.KTC_EXPORT_ROOT,
    fallback: Boolean(resolved.fallback),
    reason: resolved.reason,
    yearFolder,
    monthFolder
  });
  if (resolved.fallback) {
    await writeLauncherLog('WARN', 'EXCEL_NAS_UNAVAILABLE_LOCAL_FALLBACK', {
      activeRoot: resolved.root,
      reason: resolved.reason,
    });
  }
  return monthFolder;
}

// Do not probe the NAS during Electron startup. A disconnected UNC path can
// block Windows for many seconds. Keep the configured path only; the actual
// writable-root resolution happens when Excel export/sync is requested.
process.env.KTC_EXPORT_ROOT = readConfiguredExportRoot();

ipcMain.handle('ktc-get-export-root', async () => {
  const configured = readConfiguredExportRoot();
  const resolved = resolveWritableExportRoot(configured);
  process.env.KTC_EXPORT_ROOT = resolved.root;
  if (resolved.fallback) {
    void writeLauncherLog('WARN', 'EXCEL_NAS_UNAVAILABLE_LOCAL_FALLBACK', {
      configuredRoot: configured,
      activeRoot: resolved.root,
      reason: resolved.reason,
    });
  }
  return resolved.root;
});

ipcMain.handle('ktc-reset-export-root', async () => {
  const root = await saveConfiguredExportRoot(DEFAULT_EXPORT_ROOT);
  const resolved = resolveWritableExportRoot(root);
  process.env.KTC_EXPORT_ROOT = resolved.root;
  await ensureCurrentMonthlyFolder();
  return resolved.root;
});

ipcMain.handle('ktc-choose-export-root', async () => {
  const current = normalizeExportRoot(process.env.KTC_EXPORT_ROOT || DEFAULT_EXPORT_ROOT);
  const result = await dialog.showOpenDialog({
    title: 'Chọn thư mục lưu Excel KTC',
    defaultPath: current,
    properties: ['openDirectory', 'createDirectory'],
    buttonLabel: 'Chọn thư mục'
  });
  if (result.canceled || !result.filePaths?.[0]) {
    return { canceled: true, exportRoot: current };
  }
  const exportRoot = await saveConfiguredExportRoot(result.filePaths[0]);
  await fsp.mkdir(exportRoot, { recursive: true });
  return { canceled: false, exportRoot };
});

ipcMain.handle('ktc-save-statistics-excel', async (_event, payload = {}) => {
  const content = String(payload.content || '');
  if (!content) throw new Error('Không có dữ liệu thống kê để xuất Excel.');
  if (Buffer.byteLength(content, 'utf8') > 20 * 1024 * 1024) throw new Error('File thống kê vượt quá giới hạn 20 MB.');
  const resolved = resolveWritableExportRoot(process.env.KTC_EXPORT_ROOT || readConfiguredExportRoot());
  const root = resolved.root;
  process.env.KTC_EXPORT_ROOT = root;
  const year = String(payload.year || new Date().getFullYear()).replace(/[^0-9]/g, '') || String(new Date().getFullYear());
  const folder = path.join(root, year, 'Thống kê');
  await fsp.mkdir(folder, { recursive: true });
  const fileName = safeExportFileName(payload.fileName, `KTC_ThongKe_${year}.xls`);
  const filePath = path.join(folder, fileName.toLowerCase().endsWith('.xls') ? fileName : `${fileName}.xls`);
  await fsp.writeFile(filePath, content, 'utf8');
  return { success: true, filePath, exportRoot: root, fallback: Boolean(resolved.fallback) };
});

const originalReaddir = fsp.readdir.bind(fsp);
fsp.readdir = async (...args) => {
  const entries = await originalReaddir(...args);
  return entries.filter((entry) => {
    const name = typeof entry === 'string' ? entry : entry?.name;
    return !String(name || '').startsWith('~$');
  });
};

void writeLauncherLog('INFO', 'STARTUP_MAIN_REQUIRE_BEGIN', { elapsedMs: startupElapsedMs() });
require('./autoUpdate.cjs');
if (bundledFrontendEnabled) {
  // Ensure interception is registered BEFORE main.cjs creates its first window.
  app.whenReady().then(async () => {
    const { installBundledFrontend } = require('./bundledFrontend.cjs');
    // An older remote KTC version may have registered a service worker on this
    // origin. Remove only that worker cache once, preserving cookies and local DB.
    const swMarker = path.join(app.getPath('userData'), 'bundled-frontend-sw-cleaned-v1');
    if (!fs.existsSync(swMarker)) {
      await session.defaultSession.clearStorageData({ storages: ['serviceworkers'] });
      await fsp.writeFile(swMarker, '1', 'utf8');
    }
    await installBundledFrontend({
      session, net, frontendOrigin: FRONTEND_URL,
      root: path.join(__dirname, '..', 'frontend', 'dist'),
      log: (event, payload) => void writeLauncherLog('INFO', event, payload)
    });
    require('./main.cjs');
    void writeLauncherLog('INFO', 'STARTUP_MAIN_REQUIRE_END', { elapsedMs: startupElapsedMs() });
  }).catch((error) => {
    void writeLauncherLog('ERROR', 'BUNDLED_FE_SETUP_FAILED', safeCrashSummary(error));
    dialog.showErrorBox('KTC Desktop', 'Không tải được Frontend đã đóng gói. Vui lòng cài lại bản TEST mới.');
    app.quit();
  });
} else {
  require('./main.cjs');
  void writeLauncherLog('INFO', 'STARTUP_MAIN_REQUIRE_END', { elapsedMs: startupElapsedMs() });
}
