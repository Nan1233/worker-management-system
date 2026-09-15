const { app, ipcMain, dialog, BrowserWindow } = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

const DEFAULT_EXPORT_ROOT = path.join(os.homedir(), 'Documents', 'KTC', 'Bao cao san xuat');
const CONFIG_FILE = path.join(app.getPath('userData'), 'excel-export-config.json');
const DESKTOP_ICON = path.join(__dirname, '..', 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png');

// Windows uses the AppUserModelId to associate the running window/taskbar
// button with the packaged application icon. Keep it stable across releases.
if (process.platform === 'win32') {
  app.setAppUserModelId('vn.ktc.productioncontrol');
}

// Force the packaged KTC icon onto every BrowserWindow. This is intentionally
// done at the shell level so the icon also works when the renderer is loaded
// from the hosted Cloudflare URL instead of the packaged frontend files.
app.on('browser-window-created', (_event, window) => {
  try {
    if (process.platform === 'win32') window.setIcon(DESKTOP_ICON);
  } catch (_) {
    // The packaged icon is also configured in electron-builder; this is only
    // a runtime fallback for title-bar/taskbar rendering.
  }
});

// The desktop shell is built once, while the actual UI is served from the same
// web deployment used by the browser. This means frontend changes published to
// Cloudflare are visible in the installed desktop app without rebuilding the
// Electron package. If the web deployment is unavailable, main.cjs falls back
// to the packaged frontend/offline page.
const KTC_WEB_URL = String(
  process.env.KTC_WEB_URL || 'https://ktc-frontend.nan978971.workers.dev/'
).trim();
const KTC_WEB_ORIGIN = (() => {
  try { return new URL(KTC_WEB_URL).origin; } catch { return ''; }
})();
process.env.KTC_WEB_URL = KTC_WEB_URL;
process.env.KTC_WEB_ORIGIN = KTC_WEB_ORIGIN;

// main.cjs historically calls loadFile(FRONTEND_INDEX). Keep that contract so
// offline fallback and packaging checks remain intact, but transparently route
// only the packaged frontend entry to the hosted web application.
const originalLoadFile = BrowserWindow.prototype.loadFile;
BrowserWindow.prototype.loadFile = function patchedKtcLoadFile(filePath, ...args) {
  const normalized = path.resolve(String(filePath || ''));
  if (normalized.endsWith(`${path.sep}frontend${path.sep}dist${path.sep}index.html`)) {
    return this.loadURL(KTC_WEB_URL, {
      extraHeaders: 'pragma: no-cache\n'
    });
  }
  return originalLoadFile.call(this, filePath, ...args);
};

function normalizeExportRoot(value) {
  const raw = String(value || '').trim();
  if (!raw) return DEFAULT_EXPORT_ROOT;
  return path.resolve(raw);
}

function readConfiguredExportRoot() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return DEFAULT_EXPORT_ROOT;
    const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    return normalizeExportRoot(parsed?.exportRoot);
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
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  return candidate || fallback;
}

process.env.KTC_EXPORT_ROOT = readConfiguredExportRoot();

ipcMain.handle('ktc-get-export-root', async () => {
  return normalizeExportRoot(process.env.KTC_EXPORT_ROOT || readConfiguredExportRoot());
});

ipcMain.handle('ktc-reset-export-root', async () => {
  return saveConfiguredExportRoot(DEFAULT_EXPORT_ROOT);
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

// Register updater before the main process bootstraps so every packaged
// Windows/NSIS build checks GitHub Releases for a newer desktop shell build.
require('./autoUpdate.cjs');
require('./main.cjs');
