// Global hotkey registration for Specter AI
import { globalShortcut, BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import { getSetting } from '../services/store'
import { DEFAULT_HOTKEYS } from '../shared/constants'
import { showOverlay, toggleOverlay } from './overlay-window'

let overlayRef: BrowserWindow | null = null

export function registerHotkeys(overlayWindow: BrowserWindow): void {
  overlayRef = overlayWindow
  applyHotkeys()
}

function applyHotkeys(): void {
  if (!overlayRef || overlayRef.isDestroyed()) return

  // Unregister all first to avoid conflicts
  globalShortcut.unregisterAll()

  const hotkeys = getSetting<typeof DEFAULT_HOTKEYS>('hotkeys') || DEFAULT_HOTKEYS
  const win = overlayRef

  // Ctrl/Cmd + Enter: Ask AI based on current context
  try {
    globalShortcut.register(hotkeys.askAI, () => {
      if (win && !win.isDestroyed()) {
        showOverlay()
        win.webContents.send(IPC_CHANNELS.HOTKEY_ASK_AI)
      }
    })
  } catch (e) {
    console.warn('[Specter] Failed to register askAI hotkey:', e)
  }

  // Ctrl/Cmd + Shift + Enter: Ask AI with screenshot
  try {
    globalShortcut.register(hotkeys.screenshotAsk, () => {
      if (win && !win.isDestroyed()) {
        showOverlay()
        win.webContents.send(IPC_CHANNELS.HOTKEY_ASK_WITH_SCREENSHOT)
      }
    })
  } catch (e) {
    console.warn('[Specter] Failed to register screenshotAsk hotkey:', e)
  }

  // Ctrl/Cmd + \: Toggle overlay visibility
  try {
    globalShortcut.register(hotkeys.toggleOverlay, () => {
      if (win && !win.isDestroyed()) {
        toggleOverlay()
      }
    })
  } catch (e) {
    console.warn('[Specter] Failed to register toggleOverlay hotkey:', e)
  }

  // Ctrl/Cmd + Shift + Space: Toggle audio recording
  try {
    globalShortcut.register(hotkeys.toggleAudio, () => {
      if (win && !win.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.HOTKEY_TOGGLE_AUDIO)
      }
    })
  } catch (e) {
    console.warn('[Specter] Failed to register toggleAudio hotkey:', e)
  }
}

export function reRegisterHotkeys(): void {
  applyHotkeys()
}

export function unregisterAllHotkeys(): void {
  globalShortcut.unregisterAll()
}
