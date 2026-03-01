// Global hotkey registration for Specter AI
import { globalShortcut, BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import { getSetting } from '../services/store'
import { DEFAULT_HOTKEYS } from '../shared/constants'

export function registerHotkeys(overlayWindow: BrowserWindow): void {
  const hotkeys = getSetting<typeof DEFAULT_HOTKEYS>('hotkeys') || DEFAULT_HOTKEYS

  // Ctrl/Cmd + Enter: Ask AI based on current context
  try {
    globalShortcut.register(hotkeys.askAI, () => {
      if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.show()
        overlayWindow.webContents.send(IPC_CHANNELS.HOTKEY_ASK_AI)
      }
    })
  } catch (e) {
    console.warn('[Specter] Failed to register askAI hotkey:', e)
  }

  // Ctrl/Cmd + Shift + Enter: Ask AI with screenshot
  try {
    globalShortcut.register(hotkeys.screenshotAsk, () => {
      if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.show()
        overlayWindow.webContents.send(IPC_CHANNELS.HOTKEY_ASK_WITH_SCREENSHOT)
      }
    })
  } catch (e) {
    console.warn('[Specter] Failed to register screenshotAsk hotkey:', e)
  }

  // Ctrl/Cmd + \: Toggle overlay visibility
  try {
    globalShortcut.register(hotkeys.toggleOverlay, () => {
      if (overlayWindow && !overlayWindow.isDestroyed()) {
        if (overlayWindow.isVisible()) {
          overlayWindow.hide()
        } else {
          overlayWindow.show()
        }
      }
    })
  } catch (e) {
    console.warn('[Specter] Failed to register toggleOverlay hotkey:', e)
  }

  // Ctrl/Cmd + Shift + Space: Toggle audio recording
  try {
    globalShortcut.register(hotkeys.toggleAudio, () => {
      if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.webContents.send(IPC_CHANNELS.HOTKEY_TOGGLE_AUDIO)
      }
    })
  } catch (e) {
    console.warn('[Specter] Failed to register toggleAudio hotkey:', e)
  }
}

export function unregisterAllHotkeys(): void {
  globalShortcut.unregisterAll()
}
