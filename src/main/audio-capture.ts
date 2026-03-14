// Audio capture module — transcription service for audio received from the renderer process
// Audio recording is handled in the renderer via Web Audio API (MediaRecorder).
// This module receives audio buffers via IPC and sends them to a Whisper-compatible API.

import { getSetting } from '../services/store'
import { tmpdir } from 'os'
import { join } from 'path'
import { writeFileSync, unlinkSync, existsSync } from 'fs'
import { randomBytes } from 'crypto'

let transcriptBuffer = ''

const MAX_TRANSCRIPT_LENGTH = 5000

// Max audio buffer size: 25MB (Whisper API limit)
const MAX_AUDIO_BUFFER_SIZE = 25 * 1024 * 1024

// Allowed MIME types for audio transcription
const ALLOWED_MIME_TYPES = new Set([
  'audio/webm',
  'audio/webm;codecs=opus',
  'audio/ogg',
  'audio/ogg;codecs=opus',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/flac'
])

// Allowed file extensions mapped from MIME types
const MIME_TO_EXT: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/webm;codecs=opus': 'webm',
  'audio/ogg': 'ogg',
  'audio/ogg;codecs=opus': 'ogg',
  'audio/mp4': 'mp4',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/flac': 'flac'
}

// Request timeout for Whisper API calls (30 seconds)
const WHISPER_REQUEST_TIMEOUT_MS = 30_000

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
 * Validate and sanitize a MIME type string.
 * Returns a safe MIME type or null if invalid.
 */
function sanitizeMimeType(mimeType: string): string | null {
  if (typeof mimeType !== 'string') return null
  // Normalize: lowercase, trim whitespace
  const normalized = mimeType.toLowerCase().trim()
  // Must be an allowed MIME type
  if (ALLOWED_MIME_TYPES.has(normalized)) return normalized
  // Check prefix match (e.g. 'audio/webm;codecs=opus' matches 'audio/webm')
  for (const allowed of ALLOWED_MIME_TYPES) {
    if (normalized.startsWith(allowed)) return allowed
  }
  return null
}

/**
 * Generate a cryptographically random temp file name to prevent predictable paths.
 */
function secureTempPath(ext: string): string {
  const randomId = randomBytes(16).toString('hex')
  return join(tmpdir(), `specter-audio-${randomId}.${ext}`)
}

/**
 * Validate that a URL is HTTPS and points to an expected domain.
 */
function validateWhisperUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    // Must be HTTPS
    if (parsed.protocol !== 'https:') return false
    // Block localhost/internal network to prevent SSRF
    const hostname = parsed.hostname.toLowerCase()
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname === '::1' ||
      hostname.startsWith('10.') ||
      hostname.startsWith('172.') ||
      hostname.startsWith('192.168.') ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal')
    ) {
      return false
    }
    return true
  } catch {
    return false
  }
}

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
    if (!validateWhisperUrl(customUrl)) {
      return { configured: false, provider, error: 'Custom Whisper endpoint must be a valid HTTPS URL. Local/internal addresses are not allowed.' }
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
    // Validate custom URL before using it
    if (!validateWhisperUrl(customUrl)) return null
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

  // Validate buffer is actually a Buffer
  if (!Buffer.isBuffer(audioBuffer)) {
    throw new Error('Invalid audio data: expected a Buffer')
  }

  // Validate buffer size
  if (audioBuffer.length < 1024) {
    return '' // Too small — almost certainly silence/empty
  }
  if (audioBuffer.length > MAX_AUDIO_BUFFER_SIZE) {
    throw new Error(`Audio chunk too large (${Math.round(audioBuffer.length / 1024 / 1024)}MB). Maximum is 25MB.`)
  }

  // Validate and sanitize MIME type
  const safeMimeType = sanitizeMimeType(mimeType)
  if (!safeMimeType) {
    throw new Error(`Unsupported audio format: ${mimeType.slice(0, 50)}`)
  }

  // Get safe file extension from validated MIME type
  const ext = MIME_TO_EXT[safeMimeType] || 'webm'
  const tmpPath = secureTempPath(ext)

  try {
    writeFileSync(tmpPath, audioBuffer, { mode: 0o600 }) // restrictive permissions

    // Send to Whisper API with timeout
    const abortController = new AbortController()
    const timeout = setTimeout(() => abortController.abort(), WHISPER_REQUEST_TIMEOUT_MS)

    try {
      const formData = new FormData()
      const bufCopy = new ArrayBuffer(audioBuffer.byteLength)
      new Uint8Array(bufCopy).set(new Uint8Array(audioBuffer.buffer, audioBuffer.byteOffset, audioBuffer.byteLength))
      const blob = new Blob([bufCopy], { type: safeMimeType })
      formData.append('file', blob, `audio.${ext}`)
      formData.append('model', config.model)

      // Add language hint if configured
      const language = getSetting<string>('language')
      if (language && /^[a-z]{2,3}$/i.test(language)) {
        formData.append('language', language)
      }

      console.log(`[Specter] Sending ${audioBuffer.length} bytes (${ext}) to ${config.url} using model ${config.model}`)

      const response = await fetch(config.url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`
        },
        body: formData,
        signal: abortController.signal
      })

      if (response.ok) {
        const data = await response.json() as { text?: string }
        const text = typeof data.text === 'string' ? data.text.trim() : ''
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
    } finally {
      clearTimeout(timeout)
    }
  } catch (err: unknown) {
    // Handle abort (timeout)
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Whisper transcription timed out after 30 seconds. Check your network connection.')
    }
    // Re-throw all errors so they reach the renderer for user feedback
    if (err instanceof Error) throw err
    throw new Error(`Transcription failed: ${String(err)}`)
  } finally {
    // Clean up temp file securely
    try {
      if (existsSync(tmpPath)) unlinkSync(tmpPath)
    } catch {
      // ignore cleanup failures
    }
  }
}

export function appendTranscript(text: string, maxLength: number = MAX_TRANSCRIPT_LENGTH): void {
  // Sanitize: only allow printable characters in transcript
  const sanitized = text.replace(/[^\x20-\x7E\u00A0-\uFFFF\n\r\t]/g, '')
  transcriptBuffer += ' ' + sanitized
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
