// Screen capture + OCR pipeline — uses worker thread for OCR to avoid blocking main
import { Worker } from 'worker_threads'
import { join } from 'path'
import { execSync } from 'child_process'
import screenshot from 'screenshot-desktop'
import { screen } from 'electron'
import type { ScreenCaptureResult } from '../shared/types'
import { getOverlayWindow, showOverlay } from './overlay-window'

let isCapturing = false

interface OCRResponse {
  success: boolean
  text?: string
  error?: string
}

interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
  title: string
}

/**
 * Run OCR in a worker thread so the main process stays responsive.
 * The worker file is built as a separate entry by electron-vite.
 */
function ocrInWorker(imageBuffer: Buffer, language = 'eng'): Promise<string> {
  return new Promise((resolve, reject) => {
    const workerPath = join(__dirname, 'ocr-worker.js')
    const worker = new Worker(workerPath, {
      workerData: {
        imageBuffer: Buffer.from(imageBuffer),
        language
      }
    })

    worker.on('message', (result: OCRResponse) => {
      if (result.success) {
        resolve(result.text || '')
      } else {
        reject(new Error(result.error || 'OCR failed'))
      }
      worker.terminate()
    })

    worker.on('error', (err) => {
      reject(err)
      worker.terminate()
    })

    // Timeout after 30 seconds — OCR shouldn't take longer
    const timeout = setTimeout(() => {
      worker.terminate()
      reject(new Error('OCR timed out after 30 seconds'))
    }, 30_000)

    worker.on('exit', () => {
      clearTimeout(timeout)
    })
  })
}

/**
 * Temporarily hide the overlay window so it doesn't appear in the screenshot.
 * Returns true if the overlay was visible and was hidden.
 */
function hideOverlayForCapture(): boolean {
  const overlay = getOverlayWindow()
  if (overlay && !overlay.isDestroyed() && overlay.isVisible()) {
    overlay.hide()
    return true
  }
  return false
}

/**
 * Restore the overlay window after capture.
 */
function restoreOverlay(): void {
  showOverlay()
}

/**
 * Small delay to let the OS repaint after hiding the overlay.
 * Without this, the screenshot may still capture the overlay in-flight.
 */
function waitForRepaint(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 150))
}

/**
 * Get the bounds of the currently active/focused window using native OS commands.
 * Returns null if detection fails (graceful fallback to full-screen capture).
 */
function getActiveWindowBounds(): WindowBounds | null {
  try {
    if (process.platform === 'win32') {
      // PowerShell: get foreground window bounds via Win32 API
      const script = `
        Add-Type @"
        using System;
        using System.Runtime.InteropServices;
        public class WinAPI {
          [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
          [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
          [DllImport("user32.dll", SetLastError=true, CharSet=CharSet.Auto)]
          public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder lpString, int nMaxCount);
          [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
        }
"@
        $hwnd = [WinAPI]::GetForegroundWindow()
        $rect = New-Object WinAPI+RECT
        [WinAPI]::GetWindowRect($hwnd, [ref]$rect) | Out-Null
        $sb = New-Object System.Text.StringBuilder 256
        [WinAPI]::GetWindowText($hwnd, $sb, 256) | Out-Null
        "$($rect.Left)|$($rect.Top)|$($rect.Right - $rect.Left)|$($rect.Bottom - $rect.Top)|$($sb.ToString())"
      `.trim()

      const result = execSync(`powershell -NoProfile -Command "${script.replace(/"/g, '\\"')}"`, {
        timeout: 3000,
        encoding: 'utf-8',
        windowsHide: true
      }).trim()

      const parts = result.split('|')
      if (parts.length >= 4) {
        const x = parseInt(parts[0], 10)
        const y = parseInt(parts[1], 10)
        const width = parseInt(parts[2], 10)
        const height = parseInt(parts[3], 10)
        const title = parts.slice(4).join('|')

        if (width > 50 && height > 50) {
          return { x, y, width, height, title }
        }
      }
    } else if (process.platform === 'darwin') {
      // AppleScript: get bounds of the frontmost application's front window
      const script = `
        tell application "System Events"
          set frontApp to first application process whose frontmost is true
          set appName to name of frontApp
          tell frontApp
            set {x, y} to position of front window
            set {w, h} to size of front window
          end tell
          return (x as text) & "|" & (y as text) & "|" & (w as text) & "|" & (h as text) & "|" & appName
        end tell
      `.trim()

      const result = execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, {
        timeout: 3000,
        encoding: 'utf-8'
      }).trim()

      const parts = result.split('|')
      if (parts.length >= 4) {
        const x = parseInt(parts[0], 10)
        const y = parseInt(parts[1], 10)
        const width = parseInt(parts[2], 10)
        const height = parseInt(parts[3], 10)
        const title = parts.slice(4).join('|')

        if (width > 50 && height > 50) {
          return { x, y, width, height, title }
        }
      }
    } else if (process.platform === 'linux') {
      // xdotool + xwininfo for X11
      const windowId = execSync('xdotool getactivewindow', {
        timeout: 2000,
        encoding: 'utf-8'
      }).trim()

      const info = execSync(`xwininfo -id ${windowId}`, {
        timeout: 2000,
        encoding: 'utf-8'
      })

      const xMatch = info.match(/Absolute upper-left X:\s+(\d+)/)
      const yMatch = info.match(/Absolute upper-left Y:\s+(\d+)/)
      const wMatch = info.match(/Width:\s+(\d+)/)
      const hMatch = info.match(/Height:\s+(\d+)/)

      const titleResult = execSync(`xdotool getactivewindow getwindowname`, {
        timeout: 2000,
        encoding: 'utf-8'
      }).trim()

      if (xMatch && yMatch && wMatch && hMatch) {
        const x = parseInt(xMatch[1], 10)
        const y = parseInt(yMatch[1], 10)
        const width = parseInt(wMatch[1], 10)
        const height = parseInt(hMatch[1], 10)

        if (width > 50 && height > 50) {
          return { x, y, width, height, title: titleResult }
        }
      }
    }
  } catch (err) {
    console.warn('[Specter] Active window detection failed (will use full screen):', err)
  }

  return null
}

/**
 * Crop an image buffer to the specified bounds.
 * Uses a simple PNG pixel-copy approach via sharp if available, otherwise returns the full image.
 * Since sharp is a devDependency used for icon generation, we fall back gracefully.
 */
async function cropImageBuffer(
  imgBuffer: Buffer,
  bounds: WindowBounds,
  _displayBounds: { x: number; y: number; width: number; height: number }
): Promise<Buffer> {
  try {
    // sharp is available as a devDep — try it for cropping
    const sharp = require('sharp')

    const metadata = await sharp(imgBuffer).metadata()
    const imgWidth = metadata.width || 1
    const imgHeight = metadata.height || 1

    // Calculate scale factor (screenshot may be at display DPI scale)
    const scaleX = imgWidth / _displayBounds.width
    const scaleY = imgHeight / _displayBounds.height

    // Convert window bounds to image pixel coords, accounting for display offset
    let cropX = Math.round((bounds.x - _displayBounds.x) * scaleX)
    let cropY = Math.round((bounds.y - _displayBounds.y) * scaleY)
    let cropW = Math.round(bounds.width * scaleX)
    let cropH = Math.round(bounds.height * scaleY)

    // Clamp to image bounds
    cropX = Math.max(0, cropX)
    cropY = Math.max(0, cropY)
    cropW = Math.min(cropW, imgWidth - cropX)
    cropH = Math.min(cropH, imgHeight - cropY)

    if (cropW < 50 || cropH < 50) {
      console.warn('[Specter] Crop area too small, using full screenshot')
      return imgBuffer
    }

    return await sharp(imgBuffer)
      .extract({ left: cropX, top: cropY, width: cropW, height: cropH })
      .png()
      .toBuffer()
  } catch {
    // sharp not available or crop failed — return full image
    console.warn('[Specter] Image cropping unavailable, using full screenshot')
    return imgBuffer
  }
}

/**
 * Capture the full screen and run OCR.
 * OCR runs in a separate worker thread so the main process (IPC, hotkeys, UI)
 * is not blocked during recognition.
 * The overlay is hidden before capture to avoid the AI reading its own UI.
 *
 * @param activeWindowOnly - If true, attempt to crop to the active window's bounds
 */
export async function captureScreenText(activeWindowOnly = false): Promise<ScreenCaptureResult> {
  if (isCapturing) {
    throw new Error('Screen capture already in progress')
  }

  isCapturing = true

  // Detect active window BEFORE hiding overlay (so the user's actual window is still focused)
  let activeWindowBounds: WindowBounds | null = null
  if (activeWindowOnly) {
    activeWindowBounds = getActiveWindowBounds()
    // Don't crop to our own overlay
    if (activeWindowBounds?.title?.includes('Specter')) {
      activeWindowBounds = null
    }
  }

  const wasVisible = hideOverlayForCapture()
  try {
    if (wasVisible) await waitForRepaint()

    let imgBuffer = await screenshot({ format: 'png' })

    // Crop to active window if bounds were detected
    if (activeWindowBounds) {
      const primaryDisplay = screen.getPrimaryDisplay()
      imgBuffer = await cropImageBuffer(imgBuffer, activeWindowBounds, primaryDisplay.bounds)
    }

    const base64 = imgBuffer.toString('base64')

    // Restore overlay immediately after screenshot (before slow OCR)
    if (wasVisible) restoreOverlay()

    // Run OCR in worker thread — non-blocking
    const text = await ocrInWorker(imgBuffer)

    return {
      text,
      screenshot: base64,
      timestamp: Date.now()
    }
  } catch (err: unknown) {
    // Always restore overlay even if capture fails
    if (wasVisible) restoreOverlay()
    const message = err instanceof Error ? err.message : 'Screen capture failed'
    throw new Error(message)
  } finally {
    isCapturing = false
  }
}

/**
 * Capture screen without OCR — returns just the screenshot as base64.
 * Useful for preview mode where the user sees the screenshot before deciding to send.
 * The overlay is hidden during capture.
 */
export async function captureScreenOnly(): Promise<{ screenshot: string; timestamp: number }> {
  const wasVisible = hideOverlayForCapture()
  try {
    if (wasVisible) await waitForRepaint()

    const imgBuffer = await screenshot({ format: 'png' })

    if (wasVisible) restoreOverlay()

    return {
      screenshot: imgBuffer.toString('base64'),
      timestamp: Date.now()
    }
  } catch (err: unknown) {
    if (wasVisible) restoreOverlay()
    const message = err instanceof Error ? err.message : 'Screen capture failed'
    throw new Error(message)
  }
}

export function isCurrentlyCapturing(): boolean {
  return isCapturing
}
