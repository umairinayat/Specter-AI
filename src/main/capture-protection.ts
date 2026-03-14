// capture-protection.ts — True screen-capture exclusion on Windows
//
// Electron's setContentProtection(true) maps to SetWindowDisplayAffinity(WDA_MONITOR)
// which shows a BLACK RECTANGLE in screen capture. This module instead calls
// SetWindowDisplayAffinity with WDA_EXCLUDEFROMCAPTURE (0x11) which makes the window
// completely INVISIBLE to screen capture (available since Windows 10 2004 / build 19041).
//
// IMPORTANT: win.setOpacity() forces WS_EX_LAYERED style which can conflict with
// display affinity on Windows 11. Opacity must be handled via CSS instead.

import { BrowserWindow } from 'electron'

const WDA_NONE = 0x00000000
const WDA_EXCLUDEFROMCAPTURE = 0x00000011

let user32: {
  SetWindowDisplayAffinity: (hwnd: number, affinity: number) => boolean
  GetWindowDisplayAffinity: (hwnd: number, affinityOut: unknown) => boolean
} | null = null

let koffiLib: typeof import('koffi') | null = null
let affinityPointerType: unknown = null

/**
 * Lazily load koffi and bind to Win32 APIs.
 * Returns true if FFI is available, false otherwise.
 */
function ensureFFI(): boolean {
  if (user32) return true
  if (process.platform !== 'win32') return false

  try {
    // koffi is a native FFI library that works in Electron's main process
    koffiLib = require('koffi')
    const lib = koffiLib!.load('user32.dll')

    // BOOL SetWindowDisplayAffinity(HWND hWnd, DWORD dwAffinity)
    const SetWindowDisplayAffinity = lib.func('SetWindowDisplayAffinity', 'bool', ['int', 'uint32'])

    // BOOL GetWindowDisplayAffinity(HWND hWnd, DWORD *pdwAffinity)
    const GetWindowDisplayAffinity = lib.func('GetWindowDisplayAffinity', 'bool', ['int', 'uint32 *'])

    // Pointer type for reading back the affinity
    affinityPointerType = koffiLib!.pointer('uint32')

    user32 = { SetWindowDisplayAffinity, GetWindowDisplayAffinity }
    console.log('[Specter] FFI: Win32 user32.dll loaded successfully')
    return true
  } catch (err) {
    console.error('[Specter] FFI: Failed to load koffi/user32.dll:', err)
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
    // Read as pointer-size integer.
    if (buf.byteLength === 8) {
      // Read as BigInt then convert (HWND fits in Number range)
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
 * Returns true if successfully applied, false if fell back or failed.
 */
export function applyExcludeFromCapture(win: BrowserWindow): boolean {
  if (win.isDestroyed()) return false
  if (process.platform !== 'win32') return false

  if (!ensureFFI()) {
    // Fallback: use Electron's built-in setContentProtection (shows black box, better than nothing)
    console.warn('[Specter] FFI unavailable — falling back to setContentProtection(true)')
    try {
      win.setContentProtection(true)
    } catch {}
    return false
  }

  const hwnd = getHWND(win)
  if (hwnd === null) {
    console.error('[Specter] FFI: Could not get HWND, falling back to setContentProtection')
    try { win.setContentProtection(true) } catch {}
    return false
  }

  try {
    const result = user32!.SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE)
    if (result) {
      console.log('[Specter] FFI: WDA_EXCLUDEFROMCAPTURE applied successfully (HWND:', hwnd, ')')
      return true
    } else {
      console.warn('[Specter] FFI: SetWindowDisplayAffinity returned false — window may not support this flag')
      // Fallback
      try { win.setContentProtection(true) } catch {}
      return false
    }
  } catch (err) {
    console.error('[Specter] FFI: SetWindowDisplayAffinity failed:', err)
    try { win.setContentProtection(true) } catch {}
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
  if (!ensureFFI() || !koffiLib) return -1

  const hwnd = getHWND(win)
  if (hwnd === null) return -1

  try {
    const out = [0]
    const result = user32!.GetWindowDisplayAffinity(hwnd, out)
    if (result) {
      const affinity = out[0]
      console.log(
        `[Specter] FFI: Current display affinity = 0x${(affinity as number).toString(16).padStart(8, '0')}`,
        affinity === WDA_EXCLUDEFROMCAPTURE ? '(WDA_EXCLUDEFROMCAPTURE - OK)' :
        affinity === WDA_NONE ? '(WDA_NONE - NOT PROTECTED)' :
        '(UNKNOWN)'
      )
      return affinity as number
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
