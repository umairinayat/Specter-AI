// Overlay window — transparent, always-on-top, invisible to screen share
//
// Windows capture protection: transparent: true creates a layered window
// (WS_EX_LAYERED) which causes SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)
// to be silently ignored. We use Electron's setContentProtection(true) instead,
// which works reliably with transparent windows.

import { BrowserWindow, screen, shell } from 'electron'
import path from 'path'
import { is } from '@electron-toolkit/utils'
import { getSetting, setSetting } from '../services/store'
import { OVERLAY_DEFAULTS } from '../shared/constants'
import { IPC_CHANNELS } from '../shared/ipc-channels'

let overlayWindow: BrowserWindow | null = null

/**
 * Apply screen-capture protection.
 * On Windows: setContentProtection(true) — works with transparent windows.
 * On macOS: type:'panel' + screen-saver level handles this at window creation.
 */
function applyCaptureProtection(win: BrowserWindow): void {
  if (win.isDestroyed()) return

  if (process.platform === 'win32') {
    try {
      win.setContentProtection(true)
    } catch (err) {
      console.warn('[Specter] setContentProtection failed:', err)
    }
  }
}

function showProtectedOverlay(win: BrowserWindow, focus = false): void {
  if (win.isDestroyed()) return

  // Electron can drop Windows content protection after hide/show cycles,
  // so re-assert it whenever the overlay becomes visible.
  applyCaptureProtection(win)
  win.show()
  applyCaptureProtection(win)

  if (focus) {
    win.focus()
  }
}

export function createOverlayWindow(): BrowserWindow {
  const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize

  const savedPosition = getSetting<{ x: number; y: number }>('overlayPosition')
  const savedSize = getSetting<{ width: number; height: number }>('overlaySize')

  const winWidth = savedSize?.width || OVERLAY_DEFAULTS.width
  const winHeight = savedSize?.height || OVERLAY_DEFAULTS.height
  const x = (savedPosition != null && savedPosition.x >= 0) ? savedPosition.x : screenWidth - winWidth - OVERLAY_DEFAULTS.margin
  const y = (savedPosition != null && savedPosition.y >= 0) ? savedPosition.y : OVERLAY_DEFAULTS.margin

  overlayWindow = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    x,
    y,
    transparent: true,
    frame: false,
    movable: true,          // Explicitly allow dragging
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    focusable: true,   // Must be true for keyboard input on Windows
    hasShadow: false,   // Critical: no OS-level window shadow (leaks through capture)
    thickFrame: false,  // Windows: disable thick frame shadow/border
    // NOTE: Do NOT set 'opacity' here — it creates WS_EX_LAYERED + LWA_ALPHA on Windows
    // which breaks SetWindowDisplayAffinity (screen-capture exclusion). Opacity is
    // handled via CSS in the renderer instead.
    // macOS: 'panel' type is excluded from screen capture
    ...(process.platform === 'darwin' ? { type: 'panel' } : {}),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false // Required: @electron-toolkit/preload uses Node APIs in preload
    }
  })

  // macOS: set window level above screen saver, excluded from capture
  if (process.platform === 'darwin') {
    overlayWindow.setAlwaysOnTop(true, 'screen-saver', 1)
    overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  } else {
    // Windows/Linux: set always-on-top at screen-saver level
    overlayWindow.setAlwaysOnTop(true, 'screen-saver')
  }

  // Windows: exclude from screen capture
  applyCaptureProtection(overlayWindow)
  overlayWindow.on('show', () => {
    if (overlayWindow) applyCaptureProtection(overlayWindow)
  })

  // When the overlay renderer is ready, send the initial opacity value
  overlayWindow.webContents.on('did-finish-load', () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      const opacity = getSetting<number>('overlayOpacity') || OVERLAY_DEFAULTS.opacity
      overlayWindow.webContents.send(IPC_CHANNELS.OVERLAY_SET_OPACITY, opacity)
    }
  })

  // Save position on move
  overlayWindow.on('moved', () => {
    if (overlayWindow) {
      const [px, py] = overlayWindow.getPosition()
      setSetting('overlayPosition', { x: px, y: py })
    }
  })

  // Save size on resize
  overlayWindow.on('resize', () => {
    if (overlayWindow) {
      const [w, h] = overlayWindow.getSize()
      setSetting('overlaySize', { width: w, height: h })
    }
  })

  overlayWindow.on('closed', () => {
    overlayWindow = null
  })

  // NOTE: Click-through for transparent regions is handled natively by Electron
  // when transparent: true + frame: false is set. No setIgnoreMouseEvents needed.
  // Using setIgnoreMouseEvents was actively breaking -webkit-app-region: drag.

  // Load the overlay renderer
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    overlayWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/overlay/index.html`)
  } else {
    overlayWindow.loadFile(path.join(__dirname, '../renderer/overlay/index.html'))
  }

  // --- Security: block all navigation and new windows ---
  overlayWindow.webContents.on('will-navigate', (event, url) => {
    // In dev, allow HMR reloads to the dev server
    if (is.dev && process.env['ELECTRON_RENDERER_URL'] && url.startsWith(process.env['ELECTRON_RENDERER_URL'])) {
      return
    }
    console.warn('[Specter] Blocked overlay navigation to:', url)
    event.preventDefault()
  })

  overlayWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Open external links in the user's default browser, not in the app
    if (url.startsWith('https://')) {
      shell.openExternal(url).catch(() => {})
    }
    return { action: 'deny' }
  })

  return overlayWindow
}

export function getOverlayWindow(): BrowserWindow | null {
  return overlayWindow
}

export function toggleOverlay(): void {
  if (!overlayWindow) return
  if (overlayWindow.isVisible()) {
    overlayWindow.hide()
  } else {
    showProtectedOverlay(overlayWindow)
  }
}

export function showOverlay(options?: { focus?: boolean }): void {
  if (!overlayWindow) return
  showProtectedOverlay(overlayWindow, options?.focus ?? false)
}

export function hideOverlay(): void {
  overlayWindow?.hide()
}

/**
 * Update overlay opacity via CSS in the renderer (NOT native window opacity).
 * Using native win.setOpacity() would add WS_EX_LAYERED + LWA_ALPHA which
 * breaks screen-capture exclusion on Windows.
 */
export function setOverlayOpacity(opacity: number): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  const clamped = Math.max(0.3, Math.min(1.0, opacity))
  overlayWindow.webContents.send(IPC_CHANNELS.OVERLAY_SET_OPACITY, clamped)
}
