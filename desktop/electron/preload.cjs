const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ktcDesktop', {
  isDesktop: true,
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
  onSyncResult: (callback) => {
    const handler = (_event, value) => callback(value);
    ipcRenderer.on('ktc-excel-sync-result', handler);
    return () => ipcRenderer.removeListener('ktc-excel-sync-result', handler);
  },
  onExcelDbSyncResult: (callback) => {
    const handler = (_event, value) => callback(value);
    ipcRenderer.on('ktc-excel-db-sync-result', handler);
    return () => ipcRenderer.removeListener('ktc-excel-db-sync-result', handler);
  },
  onSyncError: (callback) => {
    const handler = (_event, value) => callback(value);
    ipcRenderer.on('ktc-excel-sync-error', handler);
    return () => ipcRenderer.removeListener('ktc-excel-sync-error', handler);
  }
});

window.addEventListener('online', () => ipcRenderer.send('ktc-network-online'));
