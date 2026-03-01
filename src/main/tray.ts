// System tray for Specter AI
import { Tray, Menu, nativeImage, app } from 'electron'
import path from 'path'
import { toggleOverlay, showOverlay, hideOverlay } from './overlay-window'
import { createDashboardWindow } from './dashboard-window'

let tray: Tray | null = null

export function createTray(): Tray {
  // Create a simple 16x16 tray icon
  const iconPath = path.join(__dirname, '../../assets/tray-icon.png')
  let icon: nativeImage

  try {
    icon = nativeImage.createFromPath(iconPath)
    if (icon.isEmpty()) throw new Error('Empty icon')
  } catch {
    // Fallback: create a simple colored icon programmatically
    icon = nativeImage.createFromBuffer(createFallbackIcon())
    icon = icon.resize({ width: 16, height: 16 })
  }

  tray = new Tray(icon)
  tray.setToolTip('Specter AI — AI Meeting Copilot')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Overlay',
      click: () => showOverlay()
    },
    {
      label: 'Hide Overlay',
      click: () => hideOverlay()
    },
    {
      label: 'Toggle Overlay',
      accelerator: 'CommandOrControl+\\',
      click: () => toggleOverlay()
    },
    { type: 'separator' },
    {
      label: 'Settings',
      click: () => createDashboardWindow()
    },
    { type: 'separator' },
    {
      label: 'Quit Specter AI',
      click: () => {
        app.quit()
      }
    }
  ])

  tray.setContextMenu(contextMenu)

  // Click tray icon to toggle overlay
  tray.on('click', () => {
    toggleOverlay()
  })

  return tray
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy()
    tray = null
  }
}

// Create a simple 16x16 PNG buffer as fallback tray icon (violet dot)
function createFallbackIcon(): Buffer {
  // Minimal 16x16 PNG with violet (#7C3AED) color
  // This is a valid minimal PNG file
  const width = 16
  const height = 16
  const channels = 4 // RGBA

  // Create raw RGBA pixel data
  const rawData = Buffer.alloc(width * height * channels)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels
      // Draw a circle
      const cx = width / 2
      const cy = height / 2
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
      if (dist <= 6) {
        rawData[idx] = 124     // R (violet)
        rawData[idx + 1] = 58  // G
        rawData[idx + 2] = 237 // B
        rawData[idx + 3] = 255 // A
      } else {
        rawData[idx + 3] = 0 // transparent
      }
    }
  }

  return nativeImage.createFromBuffer(rawData, { width, height }).toPNG()
}
