// IPC handlers — bridge between main and renderer processes
import { ipcMain, BrowserWindow, app } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import { getSetting, setSetting, getAllSettings, getConversations, saveConversation, deleteConversation, clearConversations } from '../services/store'
import { streamCompletion, cancelStream, fetchAvailableModels, estimateCost } from '../services/openrouter'
import { buildSystemPrompt, buildUserMessage, estimateTokens } from '../services/context-builder'
import { captureScreenText, captureScreenOnly } from './screen-capture'
import { startAudioCapture, stopAudioCapture, getTranscript } from './audio-capture'
import { createDashboardWindow } from './dashboard-window'
import { setOverlayOpacity } from './overlay-window'
import { APP_VERSION, DEFAULT_MODELS } from '../shared/constants'
import type { Playbook, Conversation } from '../shared/types'

export function registerIpcHandlers(overlayWindow: BrowserWindow): void {
  // AI Query — streaming with cost tracking
  ipcMain.on(IPC_CHANNELS.AI_QUERY, async (event, args: { query: string; includeScreen: boolean; includeAudio: boolean }) => {
    const apiKey = getSetting<string>('openrouterApiKey')
    if (!apiKey) {
      event.sender.send(IPC_CHANNELS.AI_STREAM_ERROR, 'No API key configured. Open Settings to add your OpenRouter API key.')
      return
    }

    const model = getSetting<string>('selectedModel') || 'google/gemini-flash-1.5'
    const systemPrompt = getSetting<string>('systemPrompt')

    let screenText = ''
    let transcript = ''

    // Capture screen if requested
    if (args.includeScreen) {
      try {
        const capture = await captureScreenText()
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

    const messages = [
      { role: 'system' as const, content: buildSystemPrompt(systemPrompt) },
      { role: 'user' as const, content: fullUserMessage }
    ]

    // Estimate prompt tokens for cost tracking
    const promptTokens = estimateTokens(messages.map(m => m.content).join(' '))
    let completionContent = ''

    // Get model pricing for cost estimation
    const modelInfo = DEFAULT_MODELS.find(m => m.id === model)
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

  // Audio controls
  ipcMain.on(IPC_CHANNELS.AUDIO_START, () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      startAudioCapture(overlayWindow)
    }
  })

  ipcMain.on(IPC_CHANNELS.AUDIO_STOP, () => {
    stopAudioCapture()
  })

  // Settings
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, (_event, key: string) => {
    return getSetting(key)
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, (_event, key: string, value: unknown) => {
    setSetting(key, value)
    // Live-update overlay opacity when changed
    if (key === 'overlayOpacity' && typeof value === 'number') {
      setOverlayOpacity(value)
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

  // Conversations
  ipcMain.handle(IPC_CHANNELS.CONVERSATIONS_LIST, () => {
    return getConversations()
  })

  ipcMain.handle(IPC_CHANNELS.CONVERSATIONS_SAVE, (_event, conversation: Conversation) => {
    saveConversation(conversation)
  })

  ipcMain.on(IPC_CHANNELS.CONVERSATIONS_DELETE, (_event, id: string) => {
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
    app.quit()
  })
}
