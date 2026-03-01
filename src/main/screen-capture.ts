// Screen capture + OCR pipeline
import screenshot from 'screenshot-desktop'
import type { ScreenCaptureResult } from '../shared/types'

let isCapturing = false

export async function captureScreenText(): Promise<ScreenCaptureResult> {
  if (isCapturing) {
    throw new Error('Screen capture already in progress')
  }

  isCapturing = true
  try {
    const imgBuffer = await screenshot({ format: 'png' })
    const base64 = imgBuffer.toString('base64')

    // Dynamic import tesseract to avoid blocking main thread startup
    const Tesseract = await import('tesseract.js')
    const result = await Tesseract.recognize(imgBuffer, 'eng', {
      logger: () => {} // silence progress logs
    })

    return {
      text: result.data.text.trim(),
      screenshot: base64,
      timestamp: Date.now()
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Screen capture failed'
    throw new Error(message)
  } finally {
    isCapturing = false
  }
}

export function isCurrentlyCapturing(): boolean {
  return isCapturing
}
