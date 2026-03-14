// IPC handlers — bridge between main and renderer processes
import { ipcMain, BrowserWindow, app, shell } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import { getSetting, setSetting, getAllSettings, getConversations, saveConversation, deleteConversation, clearConversations, isValidSetting } from '../services/store'
import { streamCompletion, cancelStream, fetchAvailableModels, estimateCost, getCachedModels } from '../services/openrouter'
import { buildSystemPrompt, buildUserMessage, estimateTokens } from '../services/context-builder'
import { captureScreenText, captureScreenOnly } from './screen-capture'
import { transcribeAudio, getTranscript, checkWhisperConfig } from './audio-capture'
import { createDashboardWindow } from './dashboard-window'
import { setOverlayOpacity } from './overlay-window'
import { reRegisterHotkeys } from './hotkey-manager'
import { APP_VERSION, DEFAULT_MODELS, DEFAULT_SETTINGS } from '../shared/constants'
import type { Playbook, Conversation } from '../shared/types'

// --- Auto-capture timer ---
let autoCaptureTimer: ReturnType<typeof setInterval> | null = null
let lastAutoScreenText = ''
let autoCaptureOverlay: BrowserWindow | null = null

function stopAutoCapture(): void {
  if (autoCaptureTimer) {
    clearInterval(autoCaptureTimer)
    autoCaptureTimer = null
  }
  lastAutoScreenText = ''
}

function startAutoCapture(intervalSec: number): void {
  stopAutoCapture()

  // Clamp to reasonable range: 5-300 seconds
  const clampedInterval = Math.max(5, Math.min(300, intervalSec))

  autoCaptureTimer = setInterval(async () => {
    if (!autoCaptureOverlay || autoCaptureOverlay.isDestroyed()) {
      stopAutoCapture()
      return
    }
    try {
      const capture = await captureScreenText()
      // Only send if text changed meaningfully (avoid spamming identical context)
      if (capture.text && capture.text !== lastAutoScreenText) {
        lastAutoScreenText = capture.text
        if (!autoCaptureOverlay.isDestroyed()) {
          autoCaptureOverlay.webContents.send(IPC_CHANNELS.AUTO_CAPTURE_UPDATE, {
            text: capture.text,
            timestamp: Date.now()
          })
        }
      }
    } catch (err: unknown) {
      console.warn('[Specter] Auto-capture failed:', err)
    }
  }, clampedInterval * 1000)
}

function syncAutoCapture(): void {
  const enabled = getSetting<boolean>('autoCapture')
  const interval = getSetting<number>('autoCaptureInterval') || DEFAULT_SETTINGS.autoCaptureInterval
  if (enabled) {
    startAutoCapture(interval)
  } else {
    stopAutoCapture()
  }
}

// --- Rate limiter ---
// Simple sliding-window rate limiter to prevent IPC abuse

interface RateLimitEntry {
  timestamps: number[]
  maxCalls: number
  windowMs: number
}

const rateLimiters: Record<string, RateLimitEntry> = {
  [IPC_CHANNELS.AI_QUERY]: { timestamps: [], maxCalls: 2, windowMs: 2000 },        // max 2 per 2s
  [IPC_CHANNELS.AUDIO_TRANSCRIBE]: { timestamps: [], maxCalls: 1, windowMs: 3000 }  // max 1 per 3s
}

function checkRateLimit(channel: string): boolean {
  const limiter = rateLimiters[channel]
  if (!limiter) return true

  const now = Date.now()
  // Prune old entries
  limiter.timestamps = limiter.timestamps.filter(t => now - t < limiter.windowMs)

  if (limiter.timestamps.length >= limiter.maxCalls) {
    console.warn(`[Specter] Rate limit exceeded for ${channel}`)
    return false
  }

  limiter.timestamps.push(now)
  return true
}

// --- Input validation helpers ---

const CONVERSATION_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/

function isValidQuery(query: unknown): query is string {
  return typeof query === 'string' && query.length > 0 && query.length <= 50000
}

function isValidConversationId(id: unknown): id is string {
  return typeof id === 'string' && CONVERSATION_ID_REGEX.test(id)
}

function isValidConversation(c: unknown): c is Conversation {
  if (typeof c !== 'object' || c === null) return false
  const conv = c as Record<string, unknown>
  return (
    typeof conv.id === 'string' && conv.id.length <= 128 &&
    typeof conv.title === 'string' && conv.title.length <= 500 &&
    Array.isArray(conv.messages) && conv.messages.length <= 1000 &&
    typeof conv.model === 'string' && conv.model.length <= 200 &&
    typeof conv.createdAt === 'number' &&
    typeof conv.updatedAt === 'number'
  )
}

function isValidMessageHistory(history: unknown): history is Array<{ role: string; content: string }> {
  if (!Array.isArray(history)) return false
  if (history.length > 50) return false // cap history length
  return history.every(
    (msg) =>
      typeof msg === 'object' && msg !== null &&
      typeof msg.role === 'string' && ['user', 'assistant', 'system'].includes(msg.role) &&
      typeof msg.content === 'string' && msg.content.length <= 50000
  )
}

function isValidSettingsKey(key: unknown): key is string {
  return typeof key === 'string' && key.length <= 100
}

export function registerIpcHandlers(overlayWindow: BrowserWindow): void {
  // Store overlay reference for auto-capture
  autoCaptureOverlay = overlayWindow
  // AI Query — streaming with cost tracking
  ipcMain.on(IPC_CHANNELS.AI_QUERY, async (event, args: { query: string; includeScreen: boolean; includeAudio: boolean; messageHistory?: Array<{ role: string; content: string }> }) => {
    // Rate limit
    if (!checkRateLimit(IPC_CHANNELS.AI_QUERY)) {
      event.sender.send(IPC_CHANNELS.AI_STREAM_ERROR, 'Too many requests. Please wait a moment.')
      return
    }

    // Validate inputs
    if (!isValidQuery(args?.query)) {
      event.sender.send(IPC_CHANNELS.AI_STREAM_ERROR, 'Invalid query.')
      return
    }

    if (args.messageHistory && !isValidMessageHistory(args.messageHistory)) {
      event.sender.send(IPC_CHANNELS.AI_STREAM_ERROR, 'Invalid message history.')
      return
    }

    const apiKey = getSetting<string>('openrouterApiKey')
    if (!apiKey) {
      event.sender.send(IPC_CHANNELS.AI_STREAM_ERROR, 'No API key configured. Open Settings to add your OpenRouter API key.')
      return
    }

    const model = getSetting<string>('selectedModel') || DEFAULT_SETTINGS.selectedModel
    const systemPrompt = getSetting<string>('systemPrompt')

    let screenText = ''
    let transcript = ''

    // Capture screen if requested
    if (args.includeScreen) {
      try {
        const smartCrop = getSetting<boolean>('smartCrop') || false
        const capture = await captureScreenText(smartCrop)
        screenText = capture.text
      } catch (err: unknown) {
        console.warn('[Specter] Screen capture failed:', err)
      }
    }

    // Get audio transcript if requested
    if (args.includeAudio) {
      transcript = getTranscript()
    }

    // Get active playbooks and inject as context
    const playbooks = getSetting<Playbook[]>('playbooks') || []
    const activePlaybooks = playbooks.filter(p => p.isActive)
    let playbookContext = ''
    if (activePlaybooks.length > 0) {
      playbookContext = activePlaybooks
        .map(p => `[PLAYBOOK: ${p.name}]\n${p.content}`)
        .join('\n\n')
    }

    const userMessage = buildUserMessage({
      screenText,
      transcript,
      userQuery: args.query
    })

    const fullUserMessage = playbookContext
      ? `${playbookContext}\n\n${userMessage}`
      : userMessage

    // Build messages array: system prompt + conversation history + new user message
    const messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [
      { role: 'system', content: buildSystemPrompt(systemPrompt) }
    ]

    // Add conversation history (last 10 messages max to stay within context limits)
    if (args.messageHistory && args.messageHistory.length > 0) {
      const recentHistory = args.messageHistory.slice(-10)
      for (const msg of recentHistory) {
        if (msg.role === 'user' || msg.role === 'assistant') {
          messages.push({ role: msg.role as 'user' | 'assistant', content: msg.content })
        }
      }
    }

    // Add the new user message with full context
    messages.push({ role: 'user', content: fullUserMessage })

    // Estimate prompt tokens for cost tracking
    const promptTokens = estimateTokens(messages.map(m => m.content).join(' '))
    let completionContent = ''

    // Get model pricing for cost estimation — check defaults first, then cached API models
    const modelInfo = DEFAULT_MODELS.find(m => m.id === model)
      || getCachedModels().find(m => m.id === model)
    const promptPrice = modelInfo?.pricing?.prompt || '0'
    const completionPrice = modelInfo?.pricing?.completion || '0'

    await streamCompletion(messages, model, apiKey, {
      onChunk: (content) => {
        completionContent += content
        if (!event.sender.isDestroyed()) {
          event.sender.send(IPC_CHANNELS.AI_STREAM_CHUNK, content)
        }
      },
      onDone: () => {
        if (!event.sender.isDestroyed()) {
          const completionTokens = estimateTokens(completionContent)
          const totalTokens = promptTokens + completionTokens
          const totalCost = estimateCost(promptTokens, completionTokens, promptPrice, completionPrice)
          event.sender.send(IPC_CHANNELS.AI_STREAM_DONE, {
            promptTokens,
            completionTokens,
            totalTokens,
            totalCost,
            model
          })
        }
      },
      onError: (error) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send(IPC_CHANNELS.AI_STREAM_ERROR, error)
        }
      }
    })
  })

  // Cancel AI stream
  ipcMain.on(IPC_CHANNELS.AI_CANCEL, () => {
    cancelStream()
  })

  // Screen capture (with OCR)
  ipcMain.handle(IPC_CHANNELS.SCREEN_CAPTURE, async () => {
    try {
      return await captureScreenText()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Screen capture failed'
      throw new Error(message)
    }
  })

  // Screen capture preview (no OCR, just screenshot)
  ipcMain.handle(IPC_CHANNELS.SCREEN_CAPTURE_PREVIEW, async () => {
    try {
      return await captureScreenOnly()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Screen capture failed'
      throw new Error(message)
    }
  })

  // Audio config check — called before starting recording to give immediate feedback
  ipcMain.handle(IPC_CHANNELS.AUDIO_CHECK_CONFIG, () => {
    return checkWhisperConfig()
  })

  // Audio transcription — receives audio buffer from renderer's MediaRecorder
  // Electron IPC can deliver ArrayBuffer as Buffer, Uint8Array, or ArrayBuffer depending on version
  ipcMain.handle(IPC_CHANNELS.AUDIO_TRANSCRIBE, async (_event, audioData: unknown, mimeType: string) => {
    // Rate limit
    if (!checkRateLimit(IPC_CHANNELS.AUDIO_TRANSCRIBE)) {
      throw new Error('Transcription rate limit exceeded. Please wait.')
    }

    // Validate mimeType is a string
    if (typeof mimeType !== 'string' || mimeType.length > 100) {
      throw new Error('Invalid MIME type')
    }

    try {
      let buffer: Buffer
      if (Buffer.isBuffer(audioData)) {
        buffer = audioData
      } else if (audioData instanceof ArrayBuffer) {
        buffer = Buffer.from(audioData)
      } else if (ArrayBuffer.isView(audioData)) {
        buffer = Buffer.from(audioData.buffer, audioData.byteOffset, audioData.byteLength)
      } else {
        buffer = Buffer.from(audioData as ArrayBuffer)
      }
      const text = await transcribeAudio(buffer, mimeType || 'audio/webm;codecs=opus')
      return text
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Transcription failed'
      throw new Error(message)
    }
  })

  // Settings — with allowlist validation
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, (_event, key: string) => {
    if (!isValidSettingsKey(key)) {
      throw new Error('Invalid settings key')
    }
    return getSetting(key)
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, (_event, key: string, value: unknown) => {
    if (!isValidSettingsKey(key)) {
      throw new Error('Invalid settings key')
    }
    if (!isValidSetting(key, value)) {
      throw new Error(`Invalid value for setting: ${key}`)
    }
    setSetting(key, value)
    // Live-update overlay opacity when changed
    if (key === 'overlayOpacity' && typeof value === 'number') {
      setOverlayOpacity(value)
    }
    // Re-sync auto-capture when its settings change
    if (key === 'autoCapture' || key === 'autoCaptureInterval') {
      syncAutoCapture()
    }
    // Re-register hotkeys when hotkey settings change
    if (key === 'hotkeys') {
      reRegisterHotkeys()
    }
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET_ALL, () => {
    return getAllSettings()
  })

  // Models
  ipcMain.handle(IPC_CHANNELS.MODELS_FETCH, async () => {
    const apiKey = getSetting<string>('openrouterApiKey')
    if (!apiKey) {
      throw new Error('No API key configured')
    }
    return fetchAvailableModels(apiKey)
  })

  // Dashboard
  ipcMain.on(IPC_CHANNELS.OPEN_DASHBOARD, () => {
    createDashboardWindow()
  })

  // Conversations — with input validation
  ipcMain.handle(IPC_CHANNELS.CONVERSATIONS_LIST, () => {
    return getConversations()
  })

  ipcMain.handle(IPC_CHANNELS.CONVERSATIONS_SAVE, (_event, conversation: unknown) => {
    if (!isValidConversation(conversation)) {
      throw new Error('Invalid conversation data')
    }
    saveConversation(conversation as Conversation)
  })

  ipcMain.on(IPC_CHANNELS.CONVERSATIONS_DELETE, (_event, id: unknown) => {
    if (!isValidConversationId(id)) {
      console.warn('[Specter] Invalid conversation ID for delete:', id)
      return
    }
    deleteConversation(id)
  })

  ipcMain.on(IPC_CHANNELS.CONVERSATIONS_CLEAR, () => {
    clearConversations()
  })

  // App
  ipcMain.handle(IPC_CHANNELS.APP_VERSION, () => {
    return APP_VERSION
  })

  ipcMain.on(IPC_CHANNELS.APP_QUIT, () => {
    stopAutoCapture()
    app.quit()
  })

  // Shell — open URLs in external browser (validated in preload)
  ipcMain.on('shell:open-external', (_event, url: unknown) => {
    if (typeof url !== 'string') return
    try {
      const parsed = new URL(url)
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        shell.openExternal(url)
      }
    } catch {
      // Invalid URL — ignore
    }
  })

  // Initialize auto-capture if enabled
  syncAutoCapture()
}
