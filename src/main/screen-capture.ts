// Screen capture + OCR pipeline — uses worker thread for OCR to avoid blocking main
import { Worker } from 'worker_threads'
import { join } from 'path'
import screenshot from 'screenshot-desktop'
import type { ScreenCaptureResult } from '../shared/types'
import { getOverlayWindow, showOverlay } from './overlay-window'

let isCapturing = false

interface OCRResponse {
  success: boolean
  text?: string
  error?: string
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
 * Capture the full screen and run OCR.
 * OCR runs in a separate worker thread so the main process (IPC, hotkeys, UI)
 * is not blocked during recognition.
 * The overlay is hidden before capture to avoid the AI reading its own UI.
 */
export async function captureScreenText(): Promise<ScreenCaptureResult> {
  if (isCapturing) {
    throw new Error('Screen capture already in progress')
  }

  isCapturing = true
  const wasVisible = hideOverlayForCapture()
  try {
    if (wasVisible) await waitForRepaint()

    const imgBuffer = await screenshot({ format: 'png' })
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
