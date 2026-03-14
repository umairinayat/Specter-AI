// Dashboard window — settings and configuration UI
import { BrowserWindow, shell } from 'electron'
import path from 'path'
import { is } from '@electron-toolkit/utils'

let dashboardWindow: BrowserWindow | null = null

export function createDashboardWindow(): BrowserWindow {
  if (dashboardWindow && !dashboardWindow.isDestroyed()) {
    dashboardWindow.focus()
    return dashboardWindow
  }

  dashboardWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 700,
    minHeight: 500,
    title: 'Specter AI — Settings',
    frame: true,
    resizable: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false // Required: @electron-toolkit/preload uses Node APIs in preload
    }
  })

  dashboardWindow.on('closed', () => {
    dashboardWindow = null
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    dashboardWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/dashboard/index.html`)
  } else {
    dashboardWindow.loadFile(path.join(__dirname, '../renderer/dashboard/index.html'))
  }

  // --- Security: block navigation and new windows ---
  dashboardWindow.webContents.on('will-navigate', (event, url) => {
    if (is.dev && process.env['ELECTRON_RENDERER_URL'] && url.startsWith(process.env['ELECTRON_RENDERER_URL'])) {
      return
    }
    console.warn('[Specter] Blocked dashboard navigation to:', url)
    event.preventDefault()
  })

  dashboardWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) {
      shell.openExternal(url).catch(() => {})
    }
    return { action: 'deny' }
  })

  return dashboardWindow
}

export function getDashboardWindow(): BrowserWindow | null {
  return dashboardWindow
}

export function closeDashboard(): void {
  if (dashboardWindow && !dashboardWindow.isDestroyed()) {
    dashboardWindow.close()
    dashboardWindow = null
  }
}
