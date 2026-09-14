const { app, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');

const UPDATE_CHECK_DELAY_MS = 8000;
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

let checking = false;
let updateDialogOpen = false;

function logUpdate(event, payload = {}) {
  try {
    console.info(`[KTC-AUTO-UPDATE] ${event}`, payload);
  } catch {
    // Never let update diagnostics affect the production app.
  }
}

async function checkForUpdates() {
  if (!app.isPackaged || checking) return;
  checking = true;
  try {
    logUpdate('CHECK', { currentVersion: app.getVersion() });
    await autoUpdater.checkForUpdates();
  } catch (error) {
    logUpdate('CHECK_FAILED', { message: error?.message || String(error) });
  } finally {
    checking = false;
  }
}

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.allowPrerelease = false;
autoUpdater.allowDowngrade = false;

autoUpdater.on('checking-for-update', () => logUpdate('CHECKING'));
autoUpdater.on('update-not-available', (info) => logUpdate('NO_UPDATE', { version: info?.version }));
autoUpdater.on('error', (error) => logUpdate('ERROR', { message: error?.message || String(error) }));

autoUpdater.on('update-available', async (info) => {
  if (updateDialogOpen) return;
  updateDialogOpen = true;

  try {
    const result = await dialog.showMessageBox({
      type: 'info',
      title: 'KTC Production Control - Có bản cập nhật',
      message: `Đã có phiên bản ${info.version} mới.`,
      detail: 'Ứng dụng sẽ tải bản cập nhật từ GitHub và cài đặt khi bạn xác nhận. Dữ liệu Excel và cấu hình trên máy được giữ nguyên.',
      buttons: ['Cập nhật ngay', 'Để sau'],
      defaultId: 0,
      cancelId: 1,
      noLink: true
    });

    if (result.response !== 0) return;

    await autoUpdater.downloadUpdate();
  } catch (error) {
    logUpdate('DOWNLOAD_FAILED', { message: error?.message || String(error) });
    await dialog.showMessageBox({
      type: 'warning',
      title: 'Không thể cập nhật KTC',
      message: 'Không tải được bản cập nhật lúc này.',
      detail: 'Bạn có thể tiếp tục sử dụng phiên bản hiện tại và thử lại sau.',
      buttons: ['Đóng']
    }).catch(() => {});
  } finally {
    updateDialogOpen = false;
  }
});

autoUpdater.on('update-downloaded', async (info) => {
  logUpdate('DOWNLOADED', { version: info?.version });
  const result = await dialog.showMessageBox({
    type: 'info',
    title: 'KTC Production Control - Sẵn sàng cập nhật',
    message: `Bản cập nhật ${info.version} đã tải xong.`,
    detail: 'Ứng dụng sẽ đóng và cài bản mới. Sau đó bạn mở KTC Production Control như bình thường.',
    buttons: ['Cài đặt và khởi động lại', 'Để lần sau'],
    defaultId: 0,
    cancelId: 1,
    noLink: true
  }).catch(() => ({ response: 1 }));

  if (result.response === 0) {
    autoUpdater.quitAndInstall(false, true);
  }
});

app.whenReady().then(() => {
  if (!app.isPackaged) return;
  setTimeout(() => void checkForUpdates(), UPDATE_CHECK_DELAY_MS);
  setInterval(() => void checkForUpdates(), UPDATE_CHECK_INTERVAL_MS);
});

module.exports = { checkForUpdates };
