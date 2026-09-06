import { app, BrowserWindow, dialog } from "electron"
import { fileURLToPath } from "node:url"

// Electron's Vulkan probe is incompatible with the native Wayland backend.
if (process.platform === "linux" && process.env.WAYLAND_DISPLAY) {
  app.disableHardwareAcceleration()
}

async function createWindow() {
  const window = new BrowserWindow({
    title: "calcn",
    width: 1200,
    height: 550,
    minWidth: 400,
    minHeight: 500,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  })

  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }))
  window.webContents.on("will-navigate", (event) => event.preventDefault())
  await window.loadFile(fileURLToPath(new URL("../dist/index.html", import.meta.url)))
  window.show()
}

app.whenReady().then(async () => {
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow().catch(showStartupError)
    }
  })
  await createWindow()
}).catch(showStartupError)

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})

function showStartupError(error) {
  dialog.showErrorBox("calcn could not start", String(error))
  app.quit()
}
