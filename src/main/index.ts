// Specter AI — Main process entry point
import { app, BrowserWindow } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { createOverlayWindow, getOverlayWindow } from './overlay-window'
import { createDashboardWindow } from './dashboard-window'
import { createTray, destroyTray } from './tray'
import { registerHotkeys, unregisterAllHotkeys } from './hotkey-manager'
import { registerIpcHandlers } from './ipc-handlers'

// Prevent multiple instances
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

app.whenReady().then(() => {
  // Set app user model id for Windows
  electronApp.setAppUserModelId('com.specter.ai')

  // Watch for shortcut events in dev
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Create the overlay window
  const overlay = createOverlayWindow()

  // Register IPC handlers
  registerIpcHandlers(overlay)

  // Register global hotkeys
  registerHotkeys(overlay)

  // Create system tray
  createTray()

  // macOS: re-create window when dock icon is clicked
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createOverlayWindow()
    } else {
      const ov = getOverlayWindow()
      if (ov) ov.show()
    }
  })
})

// Handle second instance — show overlay
app.on('second-instance', () => {
  const overlay = getOverlayWindow()
  if (overlay) {
    overlay.show()
    overlay.focus()
  }
})

// Cleanup on quit
app.on('will-quit', () => {
  unregisterAllHotkeys()
  destroyTray()
})

// Don't quit when all windows are closed (keep tray alive)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // On Windows/Linux, keep running in tray
    // Only quit via tray menu or app.quit()
  }
})
