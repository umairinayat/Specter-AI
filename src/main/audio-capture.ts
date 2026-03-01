// Audio capture module — microphone recording with rolling buffer
import { BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-channels'

let isRecording = false
let recordingStartTime = 0
let transcriptBuffer = ''
let statusInterval: ReturnType<typeof setInterval> | null = null

export function startAudioCapture(targetWindow: BrowserWindow): void {
  if (isRecording) return
  isRecording = true
  recordingStartTime = Date.now()

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

  // Note: Full mic recording requires native dependencies (mic, node-audiorecorder)
  // For Phase 1-2, we use a simulated audio capture
  // Phase 4 will implement real mic capture with Whisper transcription
  console.log('[Specter] Audio capture started (simulated — real mic in Phase 4)')
}

export function stopAudioCapture(): string {
  isRecording = false

  if (statusInterval) {
    clearInterval(statusInterval)
    statusInterval = null
  }

  const transcript = transcriptBuffer
  console.log('[Specter] Audio capture stopped')
  return transcript
}

export function appendTranscript(text: string, maxLength: number): void {
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
