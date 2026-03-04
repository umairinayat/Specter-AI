// Audio capture module — transcription service for audio received from the renderer process
// Audio recording is handled in the renderer via Web Audio API (MediaRecorder).
// This module receives audio buffers via IPC and sends them to a Whisper-compatible API.

import { getSetting } from '../services/store'
import { tmpdir } from 'os'
import { join } from 'path'
import { writeFileSync, unlinkSync, existsSync } from 'fs'

let transcriptBuffer = ''

const MAX_TRANSCRIPT_LENGTH = 5000

// Whisper endpoint configs
const WHISPER_ENDPOINTS = {
  groq: {
    url: 'https://api.groq.com/openai/v1/audio/transcriptions',
    model: 'whisper-large-v3-turbo'
  },
  openai: {
    url: 'https://api.openai.com/v1/audio/transcriptions',
    model: 'whisper-1'
  }
} as const

/**
 * Check whether Whisper transcription is properly configured.
 * Call this before starting recording to give the user immediate feedback.
 */
export function checkWhisperConfig(): { configured: boolean; provider: string; error?: string } {
  const provider = getSetting<string>('whisperProvider') || 'groq'
  const whisperApiKey = getSetting<string>('whisperApiKey') || ''

  if (!whisperApiKey) {
    const providerName = provider === 'groq' ? 'Groq' : provider === 'openai' ? 'OpenAI' : 'Whisper'
    return {
      configured: false,
      provider,
      error: `No ${providerName} API key set. Go to Settings > Audio Transcription to add your key.${
        provider === 'groq' ? ' Get a free key at console.groq.com' : ''
      }`
    }
  }

  if (provider === 'custom') {
    const customUrl = getSetting<string>('whisperApiUrl') || ''
    if (!customUrl) {
      return { configured: false, provider, error: 'Custom Whisper endpoint URL is not set. Configure it in Settings.' }
    }
  }

  return { configured: true, provider }
}

/**
 * Get the Whisper API endpoint and key based on user settings.
 *
 * Supports three providers:
 * - 'groq'   (default) — free tier via Groq Cloud (whisper-large-v3-turbo)
 * - 'openai'           — OpenAI Whisper API (whisper-1), requires OpenAI key
 * - 'custom'           — user-specified URL + model
 *
 * Users get a free Groq key at https://console.groq.com
 */
function getWhisperConfig(): { url: string; model: string; apiKey: string } | null {
  const provider = getSetting<string>('whisperProvider') || 'groq'
  const whisperApiKey = getSetting<string>('whisperApiKey') || ''

  // Do NOT fall back to OpenRouter key — it won't work with Groq or OpenAI endpoints
  if (!whisperApiKey) {
    return null
  }

  if (provider === 'custom') {
    const customUrl = getSetting<string>('whisperApiUrl') || ''
    const customModel = getSetting<string>('whisperModel') || 'whisper-1'
    if (!customUrl) return null
    return { url: customUrl, model: customModel, apiKey: whisperApiKey }
  }

  const endpoint = WHISPER_ENDPOINTS[provider as keyof typeof WHISPER_ENDPOINTS]
    || WHISPER_ENDPOINTS.groq

  return { url: endpoint.url, model: endpoint.model, apiKey: whisperApiKey }
}

/**
 * Transcribe an audio buffer using the configured Whisper-compatible API.
 * Called from the IPC handler when the renderer sends recorded audio chunks.
 *
 * @param audioBuffer - Raw audio data (webm/opus from MediaRecorder, or WAV)
 * @param mimeType - MIME type of the audio data (e.g. 'audio/webm;codecs=opus', 'audio/wav')
 * @returns The transcribed text, or empty string on failure
 */
export async function transcribeAudio(audioBuffer: Buffer, mimeType: string): Promise<string> {
  const config = getWhisperConfig()
  if (!config) {
    const check = checkWhisperConfig()
    throw new Error(check.error || 'Whisper not configured. Set a Whisper API key in Settings > Audio Transcription.')
  }

  // Skip if audio buffer is too small (< 1KB is almost certainly silence/empty)
  if (audioBuffer.length < 1024) {
    return ''
  }

  // Determine file extension from MIME type
  const ext = mimeType.includes('webm') ? 'webm'
    : mimeType.includes('ogg') ? 'ogg'
    : mimeType.includes('mp4') ? 'mp4'
    : 'wav'

  const tmpPath = join(tmpdir(), `specter-audio-${Date.now()}.${ext}`)

  try {
    writeFileSync(tmpPath, audioBuffer)

    // Send to Whisper API
    const formData = new FormData()
    const bufCopy = new ArrayBuffer(audioBuffer.byteLength)
    new Uint8Array(bufCopy).set(new Uint8Array(audioBuffer.buffer, audioBuffer.byteOffset, audioBuffer.byteLength))
    const blob = new Blob([bufCopy], { type: mimeType })
    formData.append('file', blob, `audio.${ext}`)
    formData.append('model', config.model)

    // Add language hint if configured
    const language = getSetting<string>('language')
    if (language) {
      formData.append('language', language)
    }

    console.log(`[Specter] Sending ${audioBuffer.length} bytes (${ext}) to ${config.url} using model ${config.model}`)

    const response = await fetch(config.url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: formData
    })

    if (response.ok) {
      const data = await response.json() as { text?: string }
      const text = data.text?.trim()
      if (text) {
        console.log(`[Specter] Transcription: "${text.slice(0, 80)}${text.length > 80 ? '...' : ''}"`)
        appendTranscript(text)
        return text
      }
      return ''
    } else {
      const errorBody = await response.text().catch(() => '')
      const truncatedBody = errorBody.slice(0, 200)
      console.warn(`[Specter] Whisper API ${response.status}: ${truncatedBody}`)

      if (response.status === 401 || response.status === 403) {
        throw new Error('Whisper API key is invalid or expired. Check Settings > Audio Transcription.')
      }
      if (response.status === 413) {
        throw new Error('Audio chunk too large for Whisper API. Try a shorter recording interval.')
      }
      if (response.status === 429) {
        // Rate limit — not a fatal error, just skip this chunk
        console.warn('[Specter] Whisper rate limited, skipping chunk')
        return ''
      }

      throw new Error(`Whisper API error ${response.status}: ${truncatedBody || response.statusText}`)
    }
  } catch (err: unknown) {
    // Re-throw all errors so they reach the renderer for user feedback
    if (err instanceof Error) throw err
    throw new Error(`Transcription failed: ${String(err)}`)
  } finally {
    // Clean up temp file
    try {
      if (existsSync(tmpPath)) unlinkSync(tmpPath)
    } catch {
      // ignore cleanup failures
    }
  }
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
