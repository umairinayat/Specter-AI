// Audio capture module — real microphone recording with rolling transcript buffer
import { BrowserWindow, dialog } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import { getSetting } from '../services/store'
import { tmpdir } from 'os'
import { join } from 'path'
import { writeFileSync, unlinkSync, existsSync } from 'fs'
import { execSync } from 'child_process'

import type mic from 'mic'

let isRecording = false
let recordingStartTime = 0
let transcriptBuffer = ''
let statusInterval: ReturnType<typeof setInterval> | null = null
let audioChunks: Buffer[] = []
let micInstance: ReturnType<typeof mic> | null = null
let transcriptionInterval: ReturnType<typeof setInterval> | null = null
let targetWindow: BrowserWindow | null = null
let micAvailable = false

const TRANSCRIPTION_INTERVAL_MS = 10_000 // transcribe every 10 seconds
const MAX_TRANSCRIPT_LENGTH = 5000

/**
 * Check if SoX is installed (required by the `mic` package).
 */
function isSoxInstalled(): boolean {
  try {
    execSync(process.platform === 'win32' ? 'where sox' : 'which sox', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/**
 * Start recording from the default microphone.
 * Audio data is accumulated in memory and periodically sent to Whisper for transcription.
 *
 * Requires SoX to be installed: https://sourceforge.net/projects/sox/
 *   Windows: download installer or `choco install sox`
 *   macOS:   `brew install sox`
 *   Linux:   `sudo apt install sox`
 */
export async function startAudioCapture(window: BrowserWindow): Promise<void> {
  if (isRecording) return

  targetWindow = window
  recordingStartTime = Date.now()
  audioChunks = []

  // Pre-check for SoX to avoid the unhandled spawn ENOENT crash
  if (!isSoxInstalled()) {
    console.error('[Specter] SoX is not installed — audio capture unavailable')
    const installCmd =
      process.platform === 'win32'
        ? 'Download from https://sourceforge.net/projects/sox/ or run:\n  choco install sox'
        : process.platform === 'darwin'
          ? 'brew install sox'
          : 'sudo apt install sox'

    dialog.showErrorBox(
      'SoX Required for Audio',
      `Audio recording requires SoX (Sound eXchange) to be installed.\n\n${installCmd}\n\nRestart Specter AI after installing.`
    )
    // Don't set isRecording = true — audio is not available
    return
  }

  isRecording = true

  try {
    // Dynamic import since mic is a CommonJS module
    const micImport = (await import('mic')).default || (await import('mic'))
    micInstance = micImport({
      rate: '16000',
      channels: '1',
      fileType: 'wav',
      bitwidth: '16',
      encoding: 'signed-integer',
      endian: 'little',
      device: 'default'
    })

    const micStream = micInstance!.getAudioStream()

    micStream.on('data', (chunk: Buffer) => {
      audioChunks.push(chunk)
    })

    micStream.on('error', (err: Error) => {
      console.error('[Specter] Mic stream error:', err.message)
      // If sox spawn fails at runtime, clean up gracefully
      if (err.message.includes('ENOENT') || err.message.includes('sox')) {
        console.error('[Specter] SoX process failed — stopping audio capture')
        stopAudioCapture()
      }
    })

    micInstance!.start()
    micAvailable = true
    console.log('[Specter] Audio capture started (real mic via SoX)')

    // Periodic transcription — every 10 seconds, send accumulated audio to Whisper
    transcriptionInterval = setInterval(async () => {
      if (audioChunks.length > 0) {
        await transcribeCurrentAudio()
      }
    }, TRANSCRIPTION_INTERVAL_MS)

  } catch (err: unknown) {
    console.error('[Specter] Failed to start mic:', err)
    isRecording = false
    micAvailable = false
    return
  }

  // Send status updates to renderer
  statusInterval = setInterval(() => {
    if (targetWindow && !targetWindow.isDestroyed()) {
      targetWindow.webContents.send(IPC_CHANNELS.AUDIO_STATUS, {
        isRecording: true,
        duration: Math.floor((Date.now() - recordingStartTime) / 1000),
        hasTranscript: transcriptBuffer.length > 0
      })
    }
  }, 1000)
}

/**
 * Stop recording and return the full transcript.
 */
export function stopAudioCapture(): string {
  isRecording = false

  if (micInstance) {
    try {
      micInstance.stop()
    } catch {
      // mic may already be stopped
    }
    micInstance = null
  }

  if (statusInterval) {
    clearInterval(statusInterval)
    statusInterval = null
  }

  if (transcriptionInterval) {
    clearInterval(transcriptionInterval)
    transcriptionInterval = null
  }

  const transcript = transcriptBuffer
  audioChunks = []
  targetWindow = null
  console.log('[Specter] Audio capture stopped')
  return transcript
}

/**
 * Transcribe the current accumulated audio using the Whisper API via OpenRouter.
 * Sends the transcript to the renderer via IPC.
 */
async function transcribeCurrentAudio(): Promise<void> {
  if (audioChunks.length === 0) return

  const apiKey = getSetting<string>('openrouterApiKey')
  if (!apiKey) {
    console.warn('[Specter] No API key — skipping transcription')
    return
  }

  // Combine audio chunks into a single buffer
  const audioBuffer = Buffer.concat(audioChunks)
  // Keep only the most recent chunks after transcription to save memory
  audioChunks = []

  // Build a WAV file from the raw PCM data
  const wavBuffer = buildWavBuffer(audioBuffer, 16000, 1, 16)
  const tmpPath = join(tmpdir(), `specter-audio-${Date.now()}.wav`)

  try {
    writeFileSync(tmpPath, wavBuffer)

    // Use OpenAI Whisper API (compatible with OpenRouter)
    const formData = new FormData()
    const wavCopy = new ArrayBuffer(wavBuffer.byteLength)
    new Uint8Array(wavCopy).set(new Uint8Array(wavBuffer.buffer, wavBuffer.byteOffset, wavBuffer.byteLength))
    const blob = new Blob([wavCopy], { type: 'audio/wav' })
    formData.append('file', blob, 'audio.wav')
    formData.append('model', 'whisper-1')

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      body: formData
    })

    if (response.ok) {
      const data = await response.json() as { text?: string }
      const text = data.text?.trim()
      if (text) {
        appendTranscript(text, MAX_TRANSCRIPT_LENGTH)

        // Send transcript to overlay
        if (targetWindow && !targetWindow.isDestroyed()) {
          targetWindow.webContents.send(IPC_CHANNELS.AUDIO_TRANSCRIPT, transcriptBuffer)
        }
      }
    } else {
      console.warn('[Specter] Whisper transcription failed:', response.status, response.statusText)
    }
  } catch (err: unknown) {
    console.warn('[Specter] Transcription error:', err instanceof Error ? err.message : err)
  } finally {
    // Clean up temp file
    try {
      if (existsSync(tmpPath)) unlinkSync(tmpPath)
    } catch {
      // ignore cleanup failures
    }
  }
}

/**
 * Build a WAV file buffer from raw PCM data.
 */
function buildWavBuffer(pcmData: Buffer, sampleRate: number, channels: number, bitDepth: number): Buffer {
  const byteRate = sampleRate * channels * (bitDepth / 8)
  const blockAlign = channels * (bitDepth / 8)
  const dataSize = pcmData.length
  const headerSize = 44
  const buffer = Buffer.alloc(headerSize + dataSize)

  // RIFF header
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)

  // fmt sub-chunk
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)           // sub-chunk size
  buffer.writeUInt16LE(1, 20)            // PCM format
  buffer.writeUInt16LE(channels, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(byteRate, 28)
  buffer.writeUInt16LE(blockAlign, 32)
  buffer.writeUInt16LE(bitDepth, 34)

  // data sub-chunk
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)
  pcmData.copy(buffer, headerSize)

  return buffer
}

export function appendTranscript(text: string, maxLength: number = MAX_TRANSCRIPT_LENGTH): void {
  transcriptBuffer += ' ' + text
  // Keep rolling buffer within max length
  if (transcriptBuffer.length > maxLength) {
    transcriptBuffer = transcriptBuffer.slice(-maxLength)
  }
}

export function getTranscript(): string {
  return transcriptBuffer.trim()
}

export function clearTranscript(): void {
  transcriptBuffer = ''
}

export function getIsRecording(): boolean {
  return isRecording
}

export function getRecordingDuration(): number {
  if (!isRecording) return 0
  return Math.floor((Date.now() - recordingStartTime) / 1000)
}
