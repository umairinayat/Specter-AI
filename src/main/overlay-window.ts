// Overlay window — transparent, always-on-top, invisible to screen share
import { BrowserWindow, screen } from 'electron'
import path from 'path'
import { is } from '@electron-toolkit/utils'
import { getSetting } from '../services/store'
import { OVERLAY_DEFAULTS } from '../shared/constants'

let overlayWindow: BrowserWindow | null = null

export function createOverlayWindow(): BrowserWindow {
  const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize

  const savedPosition = getSetting<{ x: number; y: number }>('overlayPosition')
  const savedSize = getSetting<{ width: number; height: number }>('overlaySize')
  const opacity = getSetting<number>('overlayOpacity') || OVERLAY_DEFAULTS.opacity

  const winWidth = savedSize?.width || OVERLAY_DEFAULTS.width
  const winHeight = savedSize?.height || OVERLAY_DEFAULTS.height
  const x = savedPosition?.x >= 0 ? savedPosition.x : screenWidth - winWidth - OVERLAY_DEFAULTS.margin
  const y = savedPosition?.y >= 0 ? savedPosition.y : OVERLAY_DEFAULTS.margin

  overlayWindow = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    x,
    y,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    focusable: true,
    hasShadow: false,
    opacity,
    // macOS: 'panel' type is excluded from screen capture
    ...(process.platform === 'darwin' ? { type: 'panel' } : {}),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  // macOS: set window level above screen saver, excluded from capture
  if (process.platform === 'darwin') {
    overlayWindow.setAlwaysOnTop(true, 'screen-saver', 1)
    overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  }

  // Windows: exclude from screen capture via content protection
  if (process.platform === 'win32') {
    overlayWindow.setContentProtection(true)
  }

  overlayWindow.setAlwaysOnTop(true, 'screen-saver')

  // Save position on move
  overlayWindow.on('moved', () => {
    if (overlayWindow) {
      const [px, py] = overlayWindow.getPosition()
      const { setSetting } = require('../services/store')
      setSetting('overlayPosition', { x: px, y: py })
    }
  })

  // Save size on resize
  overlayWindow.on('resize', () => {
    if (overlayWindow) {
      const [w, h] = overlayWindow.getSize()
      const { setSetting } = require('../services/store')
      setSetting('overlaySize', { width: w, height: h })
    }
  })

  overlayWindow.on('closed', () => {
    overlayWindow = null
  })

  // Load the overlay renderer
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    overlayWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/overlay/index.html`)
  } else {
    overlayWindow.loadFile(path.join(__dirname, '../renderer/overlay/index.html'))
  }

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
    overlayWindow.show()
  }
}

export function showOverlay(): void {
  overlayWindow?.show()
}

export function hideOverlay(): void {
  overlayWindow?.hide()
}

export function setOverlayOpacity(opacity: number): void {
  overlayWindow?.setOpacity(Math.max(0.3, Math.min(1.0, opacity)))
}
