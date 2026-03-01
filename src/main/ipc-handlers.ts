// IPC handlers — bridge between main and renderer processes
import { ipcMain, BrowserWindow, app } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import { getSetting, setSetting, getAllSettings } from '../services/store'
import { streamCompletion, cancelStream, fetchAvailableModels } from '../services/openrouter'
import { buildSystemPrompt, buildUserMessage } from '../services/context-builder'
import { captureScreenText } from './screen-capture'
import { startAudioCapture, stopAudioCapture, getTranscript, getIsRecording } from './audio-capture'
import { createDashboardWindow } from './dashboard-window'
import { APP_VERSION } from '../shared/constants'

export function registerIpcHandlers(overlayWindow: BrowserWindow): void {
  // AI Query — streaming
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

    const messages = [
      { role: 'system' as const, content: buildSystemPrompt(systemPrompt) },
      {
        role: 'user' as const,
        content: buildUserMessage({
          screenText,
          transcript,
          userQuery: args.query
        })
      }
    ]

    await streamCompletion(messages, model, apiKey, {
      onChunk: (content) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send(IPC_CHANNELS.AI_STREAM_CHUNK, content)
        }
      },
      onDone: () => {
        if (!event.sender.isDestroyed()) {
          event.sender.send(IPC_CHANNELS.AI_STREAM_DONE)
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

  // Screen capture
  ipcMain.handle(IPC_CHANNELS.SCREEN_CAPTURE, async () => {
    try {
      return await captureScreenText()
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

  // App
  ipcMain.handle(IPC_CHANNELS.APP_VERSION, () => {
    return APP_VERSION
  })

  ipcMain.on(IPC_CHANNELS.APP_QUIT, () => {
    app.quit()
  })
}
