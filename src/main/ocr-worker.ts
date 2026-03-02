// OCR Worker — runs Tesseract.js in a worker thread to avoid blocking main process
import { parentPort, workerData } from 'worker_threads'

interface OCRRequest {
  imageBuffer: Buffer
  language: string
}

interface OCRResponse {
  success: boolean
  text?: string
  error?: string
}

async function performOCR(data: OCRRequest): Promise<OCRResponse> {
  try {
    // Use require() instead of dynamic import() because:
    // 1. externalizeDepsPlugin() keeps tesseract.js external (resolved at runtime)
    // 2. The bundled output is CJS, so dynamic import() wraps the module in a namespace
    //    object where recognize ends up on .default instead of the top level
    // 3. require() gives us the CJS exports directly where recognize is at the top level
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Tesseract = require('tesseract.js') as typeof import('tesseract.js')
    const result = await Tesseract.recognize(
      Buffer.from(data.imageBuffer),
      data.language || 'eng',
      { logger: () => {} }
    )
    return {
      success: true,
      text: result.data.text.trim()
    }
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'OCR failed'
    }
  }
}

// Handle messages from main thread
if (parentPort) {
  parentPort.on('message', async (data: OCRRequest) => {
    const result = await performOCR(data)
    parentPort!.postMessage(result)
  })
}

// Handle inline workerData for one-shot mode
if (workerData) {
  performOCR(workerData as OCRRequest).then((result) => {
    parentPort?.postMessage(result)
  })
}
