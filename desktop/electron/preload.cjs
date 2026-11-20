const { contextBridge, ipcRenderer } = require('electron');

// Only fixed, explicitly exposed notification channels can be subscribed to.
// Do not expose the ipcRenderer object or an arbitrary channel name to pages.
function subscribeDesktopEvent(channel, callback) {
  if (typeof callback !== 'function') {
    throw new TypeError('KTC Desktop IPC subscription requires a callback function');
  }
  const handler = (_event, value) => callback(value);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('ktcDesktop', {
  isDesktop: true,
  getStartupDiagnostics: () => ipcRenderer.invoke('ktc-startup-diagnostics'),
  markFrontendPaint: () => ipcRenderer.send('ktc-frontend-painted'),
  saveExcel: (token, date) => ipcRenderer.invoke('ktc-save-excel', { token, date }),
  syncAllExcel: (token, date) => ipcRenderer.invoke('ktc-sync-all-excel', { token, date }),
  previewExcelDbSync: (token, yearMonth) => ipcRenderer.invoke('ktc-preview-excel-db-sync', { token, yearMonth }),
  applyExcelDbSync: (token, yearMonth) => ipcRenderer.invoke('ktc-apply-excel-db-sync', { token, yearMonth }),
  previewReportImport: (token) => ipcRenderer.invoke('ktc-preview-report-import', { token }),
  applyReportImport: (token, filePath) => ipcRenderer.invoke('ktc-apply-report-import', { token, filePath }),
  configureAutoSync: (token) => ipcRenderer.invoke('ktc-configure-auto-sync', token),
  openExportFolder: (date) => ipcRenderer.invoke('ktc-open-export-folder', date),
  getExportFolder: (date) => ipcRenderer.invoke('ktc-get-export-folder', date),
  getExportRoot: () => ipcRenderer.invoke('ktc-get-export-root'),
  chooseExportRoot: () => ipcRenderer.invoke('ktc-choose-export-root'),
  resetExportRoot: () => ipcRenderer.invoke('ktc-reset-export-root'),
  saveStatisticsExcel: (content, fileName, year) => ipcRenderer.invoke('ktc-save-statistics-excel', { content, fileName, year }),
  openLogFolder: () => ipcRenderer.invoke('ktc-open-log-folder'),
  onSyncResult: (callback) => subscribeDesktopEvent('ktc-excel-sync-result', callback),
  onExcelDbSyncResult: (callback) => subscribeDesktopEvent('ktc-excel-db-sync-result', callback),
  onSyncError: (callback) => subscribeDesktopEvent('ktc-excel-sync-error', callback)

});

window.addEventListener('online', () => ipcRenderer.send('ktc-network-online'));
