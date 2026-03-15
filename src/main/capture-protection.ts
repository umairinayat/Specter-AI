// capture-protection.ts — True screen-capture exclusion on Windows
//
// Electron's setContentProtection(true) on transparent (WS_EX_LAYERED) windows
// results in a BLACK RECTANGLE in screen captures. This module instead uses
// koffi FFI to call SetWindowDisplayAffinity with WDA_EXCLUDEFROMCAPTURE (0x11)
// which makes the window completely INVISIBLE to screen capture.
// Available since Windows 10 2004 / build 19041.
//
// IMPORTANT: Do NOT combine this with Electron's setContentProtection(true) —
// that would re-apply WDA_MONITOR and bring back the black rectangle.

import { BrowserWindow } from 'electron'

const WDA_NONE = 0x00000000
const WDA_EXCLUDEFROMCAPTURE = 0x00000011

let user32: {
  SetWindowDisplayAffinity: (hwnd: number, affinity: number) => boolean
  GetWindowDisplayAffinity: (hwnd: number, affinityOut: unknown) => boolean
} | null = null

let koffiLoaded = false
let koffiLoadFailed = false

/**
 * Lazily load koffi and bind to Win32 APIs.
 * Returns true if FFI is available, false otherwise.
 */
function ensureFFI(): boolean {
  if (user32) return true
  if (koffiLoadFailed) return false
  if (process.platform !== 'win32') return false

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const koffi = require('koffi')
    const lib = koffi.load('user32.dll')

    // BOOL SetWindowDisplayAffinity(HWND hWnd, DWORD dwAffinity)
    const SetWindowDisplayAffinity = lib.func('SetWindowDisplayAffinity', 'bool', ['int', 'uint32'])

    // BOOL GetWindowDisplayAffinity(HWND hWnd, DWORD *pdwAffinity)
    const GetWindowDisplayAffinity = lib.func('GetWindowDisplayAffinity', 'bool', ['int', 'uint32 *'])

    user32 = { SetWindowDisplayAffinity, GetWindowDisplayAffinity }
    koffiLoaded = true
    console.log('[Specter] FFI: Win32 user32.dll loaded successfully')
    return true
  } catch (err) {
    console.error('[Specter] FFI: Failed to load koffi/user32.dll:', err)
    koffiLoadFailed = true
    user32 = null
    return false
  }
}

/**
 * Get the native HWND for an Electron BrowserWindow.
 * Electron exposes this via getNativeWindowHandle() as a Buffer.
 */
function getHWND(win: BrowserWindow): number | null {
  try {
    const buf = win.getNativeWindowHandle()
    // On 64-bit Windows, HWND is 8 bytes; on 32-bit it's 4 bytes.
    if (buf.byteLength === 8) {
      const val = buf.readBigUInt64LE()
      return Number(val)
    } else if (buf.byteLength === 4) {
      return buf.readUInt32LE()
    }
    console.warn('[Specter] FFI: Unexpected HWND buffer length:', buf.byteLength)
    return null
  } catch (err) {
    console.error('[Specter] FFI: Failed to get HWND:', err)
    return null
  }
}

/**
 * Apply WDA_EXCLUDEFROMCAPTURE to make the window completely invisible to screen capture.
 * Returns true if successfully applied, false if failed.
 *
 * NOTE: Do NOT use Electron's setContentProtection(true) as a fallback — it causes
 * a BLACK RECTANGLE on transparent windows. Better to be visible than black.
 */
export function applyExcludeFromCapture(win: BrowserWindow): boolean {
  if (win.isDestroyed()) return false
  if (process.platform !== 'win32') return false

  if (!ensureFFI()) {
    console.warn('[Specter] FFI unavailable — overlay will be visible in screen captures')
    return false
  }

  const hwnd = getHWND(win)
  if (hwnd === null) {
    console.error('[Specter] FFI: Could not get HWND')
    return false
  }

  try {
    const result = user32!.SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE)
    if (result) {
      console.log('[Specter] FFI: WDA_EXCLUDEFROMCAPTURE applied successfully (HWND:', hwnd, ')')
      return true
    } else {
      console.warn('[Specter] FFI: SetWindowDisplayAffinity returned false — flag may not be supported')
      return false
    }
  } catch (err) {
    console.error('[Specter] FFI: SetWindowDisplayAffinity failed:', err)
    return false
  }
}

/**
 * Verify that the display affinity is correctly set on the window.
 * Returns the current affinity value, or -1 on failure.
 */
export function verifyDisplayAffinity(win: BrowserWindow): number {
  if (win.isDestroyed()) return -1
  if (process.platform !== 'win32') return -1
  if (!ensureFFI()) return -1

  const hwnd = getHWND(win)
  if (hwnd === null) return -1

  try {
    const out = [0]
    const result = user32!.GetWindowDisplayAffinity(hwnd, out)
    if (result) {
      const affinity = out[0] as number
      const label =
        affinity === WDA_EXCLUDEFROMCAPTURE ? '(WDA_EXCLUDEFROMCAPTURE - OK)' :
        affinity === WDA_NONE ? '(WDA_NONE - NOT PROTECTED)' :
        '(UNKNOWN)'
      console.log(`[Specter] FFI: Display affinity = 0x${affinity.toString(16).padStart(8, '0')} ${label}`)
      return affinity
    }
    return -1
  } catch (err) {
    console.error('[Specter] FFI: GetWindowDisplayAffinity failed:', err)
    return -1
  }
}

/**
 * Remove display affinity (make window visible to capture again).
 */
export function removeDisplayAffinity(win: BrowserWindow): boolean {
  if (win.isDestroyed()) return false
  if (process.platform !== 'win32') return false
  if (!ensureFFI()) return false

  const hwnd = getHWND(win)
  if (hwnd === null) return false

  try {
    return user32!.SetWindowDisplayAffinity(hwnd, WDA_NONE)
  } catch {
    return false
  }
}
