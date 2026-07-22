const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ktcDesktop', {
  isDesktop: true,
  saveExcel: (token, date) => ipcRenderer.invoke('ktc-save-excel', { token, date }),
  syncAllExcel: (token, date) => ipcRenderer.invoke('ktc-sync-all-excel', { token, date }),
  configureAutoSync: (token) => ipcRenderer.invoke('ktc-configure-auto-sync', token),
  openExportFolder: (date) => ipcRenderer.invoke('ktc-open-export-folder', date),
  getExportFolder: (date) => ipcRenderer.invoke('ktc-get-export-folder', date),
  openLogFolder: () => ipcRenderer.invoke('ktc-open-log-folder'),
  onSyncResult: (callback) => {
    const handler = (_event, value) => callback(value);
    ipcRenderer.on('ktc-excel-sync-result', handler);
    return () => ipcRenderer.removeListener('ktc-excel-sync-result', handler);
  },
  onSyncError: (callback) => {
    const handler = (_event, value) => callback(value);
    ipcRenderer.on('ktc-excel-sync-error', handler);
    return () => ipcRenderer.removeListener('ktc-excel-sync-error', handler);
  }
});
