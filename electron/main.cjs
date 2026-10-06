const {
  app,
  BrowserWindow,
  desktopCapturer,
  globalShortcut,
  ipcMain,
  session
} = require("electron");
const path = require("path");
const { pathToFileURL } = require("url");
const { resolveEnvPath } = require("../server/env.cjs");

app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

// The visible name contains a colon, which Windows rejects in folder paths.
app.setName("ServiceHostIC");
app.setPath(
  "userData",
  path.join(
    process.env.APPDATA || path.join(process.env.USERPROFILE || "", "AppData", "Roaming"),
    "ServiceHostIC"
  )
);

if (process.platform === "win32") {
  app.setAppUserModelId("com.aiinterview.assistant");
}

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
  ses.setDisplayMediaRequestHandler(async (request, callback) => {
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
        audio: request.audioRequested ? "loopback" : undefined
      });
    } catch (error) {
      console.error("display media handler failed:", error);
      callback({});
    }
  }, { useSystemPicker: false });
}

function registerIpc() {
  let pendingCapture = null;

  ipcMain.handle("capture-screenshot", () => {
    if (pendingCapture) {
      return pendingCapture;
    }

    pendingCapture = (async () => {
      const sources = await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: { width: 1280, height: 720 },
        fetchWindowIcons: false
      });

      const source = sources[0];
      if (!source || source.thumbnail.isEmpty()) {
        return null;
      }

      return {
        mimeType: "image/jpeg",
        base64: source.thumbnail.toJPEG(62).toString("base64"),
        capturedAt: Date.now()
      };
    })().finally(() => {
      pendingCapture = null;
    });

    return pendingCapture;
  });
}

function packagedEnvPath() {
  return resolveEnvPath({ packaged: true });
}

async function waitForHealth() {
  const deadline = Date.now() + 8000;

  while (Date.now() < deadline) {
    try {
      const response = await fetch("http://127.0.0.1:3001/health");
      if (response.ok) {
        return;
      }
    } catch {
      // Server is still starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  console.error("AI server did not become ready on http://127.0.0.1:3001");
}

async function startPackagedServer() {
  if (!app.isPackaged) {
    return;
  }

  process.env.DOTENV_CONFIG_PATH = packagedEnvPath();

  const serverPath = path.join(__dirname, "../server/server.js");
  await import(pathToFileURL(serverPath).href);
  await waitForHealth();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 440,
    height: 520,
    minWidth: 380,
    minHeight: 280,
    frame: false,
    transparent: true,
    hasShadow: true,
    alwaysOnTop: true,
    resizable: true,
    title: "Service Host: IC",
    skipTaskbar: true,
    icon: path.join(__dirname, "icon.ico"),
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

  const keepPointerOff = () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }

    mainWindow.setSkipTaskbar(true);
    mainWindow.setIgnoreMouseEvents(true);
  };

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    keepPointerOff();
  });

  mainWindow.on("show", keepPointerOff);
  mainWindow.on("focus", keepPointerOff);

  overlayVisible = true;

  if (!app.isPackaged) {
    mainWindow.loadURL("http://localhost:5175");
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
    mainWindow.setSkipTaskbar(true);
    mainWindow.setIgnoreMouseEvents(true);
    mainWindow.setAlwaysOnTop(true, "screen-saver");
    mainWindow.focus();
    overlayVisible = true;
  }
}

function sendToOverlay(channel, ...args) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send(channel, ...args);
}

function nudgeWindow(dx, dy) {
  if (!mainWindow) {
    return;
  }

  const [x, y] = mainWindow.getPosition();
  mainWindow.setPosition(x + dx, y + dy);
}

function resizeWindow(dw, dh) {
  if (!mainWindow) {
    return;
  }

  const [width, height] = mainWindow.getSize();
  const [minWidth, minHeight] = mainWindow.getMinimumSize();
  const nextWidth = Math.max(minWidth, Math.min(1200, width + dw));
  const nextHeight = Math.max(minHeight, Math.min(1400, height + dh));
  mainWindow.setSize(nextWidth, nextHeight);
}

function bindShortcut(accelerator, handler) {
  const registered = globalShortcut.register(accelerator, handler);
  if (!registered) {
    console.error(`Shortcut unavailable: ${accelerator}`);
  }
}

function registerShortcuts() {
  const step = 28;

  bindShortcut("CommandOrControl+Shift+H", () => {
    toggleOverlay();
  });

  bindShortcut("Alt+Shift+L", () => {
    sendToOverlay("shortcut-toggle-listen");
  });

  bindShortcut("Alt+Shift+S", () => {
    sendToOverlay("shortcut-send-screenshot");
  });

  bindShortcut("Alt+Shift+Up", () => nudgeWindow(0, -step));
  bindShortcut("Alt+Shift+Down", () => nudgeWindow(0, step));
  bindShortcut("Alt+Shift+Left", () => nudgeWindow(-step, 0));
  bindShortcut("Alt+Shift+Right", () => nudgeWindow(step, 0));

  bindShortcut("Alt+Shift+=", () => sendToOverlay("shortcut-opacity", 0.05));
  bindShortcut("Alt+Shift+-", () => sendToOverlay("shortcut-opacity", -0.05));

  bindShortcut("Alt+Shift+[", () => resizeWindow(-step, 0));
  bindShortcut("Alt+Shift+]", () => resizeWindow(step, 0));
  bindShortcut("Alt+Shift+PageUp", () => resizeWindow(0, -step));
  bindShortcut("Alt+Shift+PageDown", () => resizeWindow(0, step));

  bindShortcut("Alt+PageUp", () => sendToOverlay("shortcut-scroll-answer", -1));
  bindShortcut("Alt+PageDown", () => sendToOverlay("shortcut-scroll-answer", 1));

  bindShortcut("Alt+Shift+C", () => sendToOverlay("shortcut-copy-answer"));
  bindShortcut("Alt+Shift+X", () => sendToOverlay("shortcut-clear-transcript"));

  bindShortcut("CommandOrControl+Shift+I", () => {
    if (mainWindow) {
      mainWindow.webContents.toggleDevTools();
    }
  });
}

app.whenReady().then(async () => {
  allowMediaPermissions();
  registerIpc();

  try {
    await startPackagedServer();
  } catch (error) {
    console.error("Failed to start AI server:", error);
  }

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
