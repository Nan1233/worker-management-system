// Presentation/IPC: folder actions, injected with trusted IPC guard from main.
// All handlers remain wrapped by protectedDesktopIpc; no direct trust bypass.
function registerFolderIpc({ ipcMain, protectedDesktopIpc, getDateParts, assertDate, getExportRoot, path, fs, shell, app }) {
  ipcMain.handle('ktc-open-export-folder', protectedDesktopIpc(async (_event, date) => {
    const selected = date || getDateParts().date;
    assertDate(selected);
    const [year] = selected.split('-');
    const folder = path.join(getExportRoot(), year);
    await fs.mkdir(folder, { recursive: true });
    const error = await shell.openPath(folder);
    if (error) throw new Error(error);
    return folder;
  }));
  ipcMain.handle('ktc-get-export-folder', protectedDesktopIpc(async (_event, date) => {
    const selected = date || getDateParts().date;
    assertDate(selected);
    const [year] = selected.split('-');
    const folder = path.join(getExportRoot(), year);
    await fs.mkdir(folder, { recursive: true });
    return folder;
  }));
  ipcMain.handle('ktc-open-log-folder', protectedDesktopIpc(async () => {
    const folder = path.join(app.getPath('userData'), 'logs');
    await fs.mkdir(folder, { recursive: true });
    const error = await shell.openPath(folder);
    if (error) throw new Error(error);
    return folder;
  }));
  
  
}

module.exports = { registerFolderIpc };
