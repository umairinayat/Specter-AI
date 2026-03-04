import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-channels'

export interface StreamDoneData {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  totalCost: number
  model: string
}

export interface SpecterAPI {
  // AI
  queryAI: (query: string, includeScreen: boolean, includeAudio: boolean) => void
  cancelAI: () => void
  onStreamChunk: (callback: (chunk: string) => void) => () => void
  onStreamDone: (callback: (data: StreamDoneData) => void) => () => void
  onStreamError: (callback: (error: string) => void) => () => void

  // Screen
  captureScreen: () => Promise<{ text: string; screenshot?: string; timestamp: number }>
  captureScreenPreview: () => Promise<{ screenshot: string; timestamp: number }>

  // Audio — recording is handled in renderer via MediaRecorder
  checkAudioConfig: () => Promise<{ configured: boolean; provider: string; error?: string }>
  sendAudioForTranscription: (audioData: ArrayBuffer, mimeType: string) => Promise<string>
  onTranscript: (callback: (text: string) => void) => () => void
  onAudioStatus: (callback: (status: { isRecording: boolean; duration: number; error?: string }) => void) => () => void

  // Settings
  getSetting: <T>(key: string) => Promise<T>
  setSetting: (key: string, value: unknown) => Promise<void>
  getAllSettings: () => Promise<Record<string, unknown>>

  // Models
  fetchModels: () => Promise<Array<{ id: string; name: string; pricing: { prompt: string; completion: string }; context_length: number }>>

  // Hotkeys
  onHotkeyAskAI: (callback: () => void) => () => void
  onHotkeyScreenshot: (callback: () => void) => () => void
  onHotkeyToggleAudio: (callback: () => void) => () => void
  onHotkeyToggleOverlay: (callback: () => void) => () => void

  // Dashboard
  openDashboard: () => void

  // Conversations
  listConversations: () => Promise<Array<{ id: string; title: string; messages: Array<{ id: string; role: string; content: string; timestamp: number; tokenCount?: number; cost?: number }>; model: string; createdAt: number; updatedAt: number }>>
  saveConversation: (conversation: { id: string; title: string; messages: Array<{ id: string; role: string; content: string; timestamp: number; tokenCount?: number; cost?: number }>; model: string; createdAt: number; updatedAt: number }) => Promise<void>
  deleteConversation: (id: string) => void
  clearConversations: () => void

  // App
  getVersion: () => Promise<string>
  quit: () => void
}

const api: SpecterAPI = {
  // AI
  queryAI: (query, includeScreen, includeAudio) => {
    ipcRenderer.send(IPC_CHANNELS.AI_QUERY, { query, includeScreen, includeAudio })
  },
  cancelAI: () => {
    ipcRenderer.send(IPC_CHANNELS.AI_CANCEL)
  },
  onStreamChunk: (callback) => {
    const handler = (_: Electron.IpcRendererEvent, chunk: string) => callback(chunk)
    ipcRenderer.on(IPC_CHANNELS.AI_STREAM_CHUNK, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.AI_STREAM_CHUNK, handler)
  },
  onStreamDone: (callback) => {
    const handler = (_: Electron.IpcRendererEvent, data: StreamDoneData) => callback(data)
    ipcRenderer.on(IPC_CHANNELS.AI_STREAM_DONE, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.AI_STREAM_DONE, handler)
  },
  onStreamError: (callback) => {
    const handler = (_: Electron.IpcRendererEvent, error: string) => callback(error)
    ipcRenderer.on(IPC_CHANNELS.AI_STREAM_ERROR, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.AI_STREAM_ERROR, handler)
  },

  // Screen
  captureScreen: () => ipcRenderer.invoke(IPC_CHANNELS.SCREEN_CAPTURE),
  captureScreenPreview: () => ipcRenderer.invoke(IPC_CHANNELS.SCREEN_CAPTURE_PREVIEW),

  // Audio — recording happens in renderer, transcription in main
  checkAudioConfig: () => {
    return ipcRenderer.invoke(IPC_CHANNELS.AUDIO_CHECK_CONFIG) as Promise<{ configured: boolean; provider: string; error?: string }>
  },
  sendAudioForTranscription: (audioData: ArrayBuffer, mimeType: string) => {
    // Convert ArrayBuffer to Buffer-compatible format for IPC transfer
    return ipcRenderer.invoke(IPC_CHANNELS.AUDIO_TRANSCRIBE, audioData, mimeType) as Promise<string>
  },
  onTranscript: (callback) => {
    const handler = (_: Electron.IpcRendererEvent, text: string) => callback(text)
    ipcRenderer.on(IPC_CHANNELS.AUDIO_TRANSCRIPT, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.AUDIO_TRANSCRIPT, handler)
  },
  onAudioStatus: (callback) => {
    const handler = (_: Electron.IpcRendererEvent, status: { isRecording: boolean; duration: number; error?: string }) => callback(status)
    ipcRenderer.on(IPC_CHANNELS.AUDIO_STATUS, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.AUDIO_STATUS, handler)
  },

  // Settings
  getSetting: <T>(key: string) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET, key) as Promise<T>,
  setSetting: (key, value) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, key, value),
  getAllSettings: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET_ALL),

  // Models
  fetchModels: () => ipcRenderer.invoke(IPC_CHANNELS.MODELS_FETCH),

  // Hotkeys
  onHotkeyAskAI: (callback) => {
    const handler = () => callback()
    ipcRenderer.on(IPC_CHANNELS.HOTKEY_ASK_AI, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.HOTKEY_ASK_AI, handler)
  },
  onHotkeyScreenshot: (callback) => {
    const handler = () => callback()
    ipcRenderer.on(IPC_CHANNELS.HOTKEY_ASK_WITH_SCREENSHOT, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.HOTKEY_ASK_WITH_SCREENSHOT, handler)
  },
  onHotkeyToggleAudio: (callback) => {
    const handler = () => callback()
    ipcRenderer.on(IPC_CHANNELS.HOTKEY_TOGGLE_AUDIO, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.HOTKEY_TOGGLE_AUDIO, handler)
  },
  onHotkeyToggleOverlay: (callback) => {
    const handler = () => callback()
    ipcRenderer.on(IPC_CHANNELS.HOTKEY_TOGGLE_OVERLAY, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.HOTKEY_TOGGLE_OVERLAY, handler)
  },

  // Dashboard
  openDashboard: () => ipcRenderer.send(IPC_CHANNELS.OPEN_DASHBOARD),

  // Conversations
  listConversations: () => ipcRenderer.invoke(IPC_CHANNELS.CONVERSATIONS_LIST),
  saveConversation: (conversation) => ipcRenderer.invoke(IPC_CHANNELS.CONVERSATIONS_SAVE, conversation),
  deleteConversation: (id) => ipcRenderer.send(IPC_CHANNELS.CONVERSATIONS_DELETE, id),
  clearConversations: () => ipcRenderer.send(IPC_CHANNELS.CONVERSATIONS_CLEAR),

  // App
  getVersion: () => ipcRenderer.invoke(IPC_CHANNELS.APP_VERSION),
  quit: () => ipcRenderer.send(IPC_CHANNELS.APP_QUIT)
}

contextBridge.exposeInMainWorld('specterAPI', api)
