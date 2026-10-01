const { app, ipcMain, dialog, BrowserWindow } = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const Module = require('node:module');

// Test desktop stores Excel on the company NAS.
const DEFAULT_EXPORT_ROOT = '\\\\KTCNAS\\Public\\3. SẢN XUẤT-製造\\Linh tinh';
const LEGACY_NETWORK_EXPORT_ROOT = DEFAULT_EXPORT_ROOT;
const LEGACY_LOCAL_EXPORT_ROOT = path.join(os.homedir(), 'Documents', 'KTC', 'Bao cao san xuat');
const CONFIG_FILE = path.join(app.getPath('userData'), 'excel-export-config.json');
const DESKTOP_ICON = path.join(__dirname, '..', 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png');

if (process.platform === 'win32') app.setAppUserModelId('vn.ktc.productioncontrol');

const TEST_FRONTEND_URL = 'https://ktc-fe-test.nan978971.workers.dev';
process.env.KTC_API_URL = 'https://ktc-be-test.nan978971.workers.dev/api';
process.env.KTC_WEB_ORIGIN = TEST_FRONTEND_URL;

let launcherLogWriter = null;
function writeLauncherLog(level, event, payload = {}) {
  try {
    const userData = app.getPath('userData');
    const logPath = path.join(userData, 'desktop-launcher.log');
    const line = JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...payload }) + '\n';
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

  const originalWindowLoadFile = window.loadFile.bind(window);
  window.loadFile = async function loadRemoteTestFrontend(filePath, ...args) {
    const resolved = path.resolve(String(filePath || ''));
    if (path.basename(resolved).toLowerCase() === 'index.html') {
      try { await window.webContents.session.clearCache(); } catch (_) {}
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
        validatedURL
      });
    }
  });
});

// IMPORTANT: install the one-sheet template injector BEFORE main.cjs loads
// monthlyWorkbookLocal.cjs. This is the active GC export path on test.
require('./excelExportContractPatch.v3.cjs');
require('./excelDbTruthPatch.v2.cjs');

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
    if (/^linh\s*tinh$/i.test(configured) || isLegacyNetworkExportRoot(configured)) return DEFAULT_EXPORT_ROOT;
    return normalizeExportRoot(configured);
  } catch {
    return DEFAULT_EXPORT_ROOT;
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

process.env.KTC_EXPORT_ROOT = readConfiguredExportRoot();
void ensureCurrentMonthlyFolder().catch((error) => {
  void writeLauncherLog('WARN', 'EXCEL_MONTH_FOLDER_CREATE_FAILED', {
    root: process.env.KTC_EXPORT_ROOT,
    message: error?.message || String(error)
  });
});

ipcMain.handle('ktc-get-export-root', async () => normalizeExportRoot(process.env.KTC_EXPORT_ROOT || readConfiguredExportRoot()));
ipcMain.handle('ktc-reset-export-root', async () => {
  const root = await saveConfiguredExportRoot(DEFAULT_EXPORT_ROOT);
  await ensureCurrentMonthlyFolder();
  return root;
});
ipcMain.handle('ktc-choose-export-root', async () => {
  const current = normalizeExportRoot(process.env.KTC_EXPORT_ROOT || DEFAULT_EXPORT_ROOT);
  const result = await dialog.showOpenDialog({
    title: 'Chọn thư mục lưu Excel KTC',
    defaultPath: current,
    properties: ['openDirectory', 'createDirectory'],
    buttonLabel: 'Chọn thư mục'
  });
  if (result.canceled || !result.filePaths?.[0]) return { canceled: true, exportRoot: current };
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

// Hotfix for the optimized desktop Excel export. The export itself already
// completes successfully; the remaining failure is only the final result
// calculation in main.cjs referencing companyData outside its try scope.
function requireMainWithExcelScopeHotfix() {
  const mainPath = require.resolve('./main.cjs');
  // Node 24 does not expose a dedicated .cjs loader on Module._extensions.
  // Use the standard JS loader as the fallback compiler for main.cjs.
  const originalCjsLoader = Module._extensions['.cjs'] || Module._extensions['.js'];
  if (typeof originalCjsLoader !== 'function') {
    throw new Error('Không tìm thấy CommonJS loader để nạp main.cjs.');
  }

  Module._extensions['.cjs'] = function loadCjsWithExcelScopeHotfix(module, filename) {
    if (path.resolve(filename) !== path.resolve(mainPath)) {
      return originalCjsLoader(module, filename);
    }

    let source = fs.readFileSync(filename, 'utf8');
    const buggyBlock = `  const expectedFileCount = Object.entries(companyData?.processes || {})
    .filter(([, data]) => Array.isArray(data?.reports) && data.reports.length > 0).length;`;
    const fixedBlock = `  const expectedFileCount = files.filter((file) => file.category === 'MONTHLY_PROCESS').length;`;

    if (source.includes(buggyBlock)) {
      source = source.replace(buggyBlock, fixedBlock);
      void writeLauncherLog('INFO', 'MAIN_EXCEL_SCOPE_HOTFIX_APPLIED', {
        file: filename,
        replacement: 'companyData-scope -> generated-monthly-process-count'
      });
    } else {
      void writeLauncherLog('INFO', 'MAIN_EXCEL_SCOPE_HOTFIX_NOT_NEEDED', { file: filename });
    }

    return module._compile(source, filename);
  };

  try {
    require(mainPath);
  } finally {
    delete Module._extensions['.cjs'];
  }
}

requireMainWithExcelScopeHotfix();
