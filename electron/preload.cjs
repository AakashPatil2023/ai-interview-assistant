const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  shortcuts: {
    toggleOverlay: "Ctrl+Shift+H",
    toggleListen: "Alt+Shift+L",
    sendScreenshot: "Alt+Shift+S",
    move: "Alt+Shift+Arrows",
    opacity: "Alt+Shift++ / -",
    width: "Alt+Shift+[ / ]",
    height: "Alt+Shift+PgUp / PgDn",
    copyAnswer: "Alt+Shift+C",
    clearTranscript: "Alt+Shift+X"
  },
  features: {
    meetingAudio: true,
    screenCapture: true,
    platform: process.platform
  },
  captureScreenshot: () => ipcRenderer.invoke("capture-screenshot"),
  onToggleListen: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("shortcut-toggle-listen", listener);
    return () => ipcRenderer.removeListener("shortcut-toggle-listen", listener);
  },
  onSendScreenshot: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("shortcut-send-screenshot", listener);
    return () => ipcRenderer.removeListener("shortcut-send-screenshot", listener);
  },
  onOpacityChange: (callback) => {
    const listener = (_event, delta) => callback(delta);
    ipcRenderer.on("shortcut-opacity", listener);
    return () => ipcRenderer.removeListener("shortcut-opacity", listener);
  },
  onCopyAnswer: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("shortcut-copy-answer", listener);
    return () => ipcRenderer.removeListener("shortcut-copy-answer", listener);
  },
  onClearTranscript: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("shortcut-clear-transcript", listener);
    return () => ipcRenderer.removeListener("shortcut-clear-transcript", listener);
  }
});
