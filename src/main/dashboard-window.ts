// Dashboard window — settings and configuration UI
import { BrowserWindow } from 'electron'
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
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false
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
