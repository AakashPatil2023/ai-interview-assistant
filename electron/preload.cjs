const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  shortcuts: {
    toggleOverlay: "Ctrl+Shift+H"
  },
  features: {
    meetingAudio: true,
    platform: process.platform
  }
});
