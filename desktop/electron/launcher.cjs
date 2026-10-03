const { app, ipcMain, dialog, BrowserWindow } = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

// Test desktop stores Excel on the company NAS when it is reachable.
const DEFAULT_EXPORT_ROOT = '\\\\KTCNAS\\Public\\3. SẢN XUẤT-製造\\Linh tinh';
const LEGACY_NETWORK_EXPORT_ROOT = DEFAULT_EXPORT_ROOT;
const LEGACY_LOCAL_EXPORT_ROOT = path.join(os.homedir(), 'Documents', 'KTC', 'Bao cao san xuat');
const CONFIG_FILE = path.join(app.getPath('userData'), 'excel-export-config.json');
const DESKTOP_ICON = path.join(__dirname, '..', 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png');

if (process.platform === 'win32') {
  app.setAppUserModelId('vn.ktc.productioncontrol');
}

// Test desktop always renders the deployed TEST FE and uses the TEST BE.
// The desktop package does not contain a frontend build anymore.
const TEST_FRONTEND_URL = 'https://ktc-fe-test.nan978971.workers.dev';
process.env.KTC_API_URL = 'https://ktc-be-test.nan978971.workers.dev/api';
process.env.KTC_WEB_ORIGIN = TEST_FRONTEND_URL;

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

app.on('browser-window-created', (_event, window) => {
  try {
    if (process.platform === 'win32') window.setIcon(DESKTOP_ICON);
  } catch (_) {}

  // Test desktop always loads the deployed TEST FE.
  const originalWindowLoadFile = window.loadFile.bind(window);
  window.loadFile = async function loadRemoteTestFrontend(filePath, ...args) {
    const resolved = path.resolve(String(filePath || ''));
    const fileName = path.basename(resolved).toLowerCase();
    if (fileName === 'index.html') {
      try {
        await window.webContents.session.clearCache();
      } catch (_) {}
      await window.loadURL(TEST_FRONTEND_URL, {
        extraHeaders: 'Cache-Control: no-cache\nPragma: no-cache\n'
      });
      return window;
    }
    return originalWindowLoadFile(filePath, ...args);
  };

  window.webContents.on('did-navigate', (_navigateEvent, url) => {
    if (url === TEST_FRONTEND_URL || url.startsWith(`${TEST_FRONTEND_URL}/`)) {
      void writeLauncherLog('INFO', 'REMOTE_FE_LOADED', { url });
    }
  });

  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    if (validatedURL === TEST_FRONTEND_URL || validatedURL.startsWith(`${TEST_FRONTEND_URL}/`)) {
      void writeLauncherLog('ERROR', 'REMOTE_FE_LOAD_FAILED', {
        errorCode,
        errorDescription,
        validatedURL,
      });
    }
  });
});

// v5 is the single active GC Excel contract. Older contract patches are no longer loaded.
require('./excelExportContractPatch.v5.cjs');

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
    // It must mean the company NAS folder in the TEST desktop.
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
    fs.mkdirSync(configured, { recursive: true });
    fs.accessSync(configured, fs.constants.R_OK | fs.constants.W_OK);
    return { root: configured, fallback: false };
  } catch (error) {
    const localRoot = LEGACY_LOCAL_EXPORT_ROOT;
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
  const root = normalizeExportRoot(process.env.KTC_EXPORT_ROOT || DEFAULT_EXPORT_ROOT);
  const { year, month } = getBangkokDateParts();
  const yearFolder = path.join(root, year);
  const monthFolder = path.join(yearFolder, month);
  await fsp.mkdir(monthFolder, { recursive: true });
  await writeLauncherLog('INFO', 'EXCEL_MONTH_FOLDER_READY', { root, yearFolder, monthFolder });
  return monthFolder;
}

const configuredExportRoot = readConfiguredExportRoot();
const resolvedExportRoot = resolveWritableExportRoot(configuredExportRoot);
process.env.KTC_EXPORT_ROOT = resolvedExportRoot.root;
if (resolvedExportRoot.fallback) {
  void writeLauncherLog('WARN', 'EXCEL_NAS_UNAVAILABLE_LOCAL_FALLBACK', {
    configuredRoot: configuredExportRoot,
    activeRoot: resolvedExportRoot.root,
    reason: resolvedExportRoot.reason,
  });
}
void ensureCurrentMonthlyFolder().catch((error) => {
  void writeLauncherLog('WARN', 'EXCEL_MONTH_FOLDER_CREATE_FAILED', {
    root: process.env.KTC_EXPORT_ROOT,
    message: error?.message || String(error),
  });
});

ipcMain.handle('ktc-get-export-root', async () => {
  const resolved = resolveWritableExportRoot(readConfiguredExportRoot());
  process.env.KTC_EXPORT_ROOT = resolved.root;
  if (resolved.fallback) {
    void writeLauncherLog('WARN', 'EXCEL_NAS_UNAVAILABLE_LOCAL_FALLBACK', {
      configuredRoot: readConfiguredExportRoot(),
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
  const root = normalizeExportRoot(process.env.KTC_EXPORT_ROOT || readConfiguredExportRoot());
  const year = String(payload.year || new Date().getFullYear()).replace(/[^0-9]/g, '') || String(new Date().getFullYear());
  const folder = path.join(root, year, 'Thống kê');
  await fsp.mkdir(folder, { recursive: true });
  const fileName = safeExportFileName(payload.fileName, `KTC_ThongKe_${year}.xls`);
  const filePath = path.join(folder, fileName.toLowerCase().endsWith('.xls') ? fileName : `${fileName}.xls`);
  await fsp.writeFile(filePath, content, 'utf8');
  return { success: true, filePath, exportRoot: root };
});

const originalReaddir = fsp.readdir.bind(fsp);
fsp.readdir = async (...args) => {
  const entries = await originalReaddir(...args);
  return entries.filter((entry) => {
    const name = typeof entry === 'string' ? entry : entry?.name;
    return !String(name || '').startsWith('~$');
  });
};

require('./autoUpdate.cjs');
require('./main.cjs');
