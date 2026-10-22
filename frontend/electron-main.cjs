const { app, BrowserWindow, shell } = require("electron");

const APP_URL = process.env.KTC_MES_URL || "https://ktc-frontend.nan978971.workers.dev";
const APP_ORIGIN = new URL(APP_URL).origin;

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#f5f7fb",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  win.once("ready-to-show", () => win.show());

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) shell.openExternal(url);
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    try {
      if (new URL(url).origin !== APP_ORIGIN) {
        event.preventDefault();
        if (url.startsWith("https://")) shell.openExternal(url);
      }
    } catch {
      event.preventDefault();
    }
  });

  win.loadURL(APP_URL).catch((error) => {
    console.error("Không thể mở KTC MES:", error);
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
