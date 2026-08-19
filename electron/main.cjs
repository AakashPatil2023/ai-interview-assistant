const {
  app,
  BrowserWindow,
  desktopCapturer,
  globalShortcut,
  session
} = require("electron");
const path = require("path");

let mainWindow;
let overlayVisible = true;

function allowMediaPermissions() {
  const ses = session.defaultSession;

  ses.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = [
      "media",
      "microphone",
      "audioCapture",
      "display-capture",
      "mediaKeySystem"
    ].includes(permission);

    callback(allowed);
  });

  ses.setPermissionCheckHandler((_webContents, permission) => {
    return [
      "media",
      "microphone",
      "audioCapture",
      "display-capture",
      "mediaKeySystem"
    ].includes(permission);
  });

  // Meeting mode: getDisplayMedia → primary screen + Windows system loopback audio
  ses.setDisplayMediaRequestHandler(async (_request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: { width: 0, height: 0 },
        fetchWindowIcons: false
      });

      if (!sources.length) {
        callback({});
        return;
      }

      callback({
        video: sources[0],
        audio: "loopback"
      });
    } catch (error) {
      console.error("display media handler failed:", error);
      callback({});
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 720,
    minWidth: 360,
    minHeight: 580,
    frame: false,
    transparent: true,
    hasShadow: true,
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: false,
    backgroundColor: "#00000000",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false
    }
  });

  // Keep above Meet / fullscreen apps on Windows
  mainWindow.setAlwaysOnTop(true, "screen-saver");

  // Hide this window from screen capture (Google Meet, Zoom, etc.)
  mainWindow.setContentProtection(true);

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  overlayVisible = true;

  if (!app.isPackaged) {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadFile(
      path.join(__dirname, "../dist/index.html")
    );
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function toggleOverlay() {
  if (!mainWindow) {
    return;
  }

  if (overlayVisible) {
    mainWindow.hide();
    overlayVisible = false;
  } else {
    mainWindow.show();
    mainWindow.setAlwaysOnTop(true, "screen-saver");
    mainWindow.focus();
    overlayVisible = true;
  }
}

function registerShortcuts() {
  globalShortcut.register("CommandOrControl+Shift+H", () => {
    toggleOverlay();
  });

  globalShortcut.register("CommandOrControl+Shift+I", () => {
    if (mainWindow) {
      mainWindow.webContents.toggleDevTools();
    }
  });
}

app.whenReady().then(() => {
  allowMediaPermissions();
  createWindow();
  registerShortcuts();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
