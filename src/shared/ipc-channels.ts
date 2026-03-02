// IPC channel constants for main ↔ renderer communication
export const IPC_CHANNELS = {
  // Overlay
  TOGGLE_OVERLAY: 'overlay:toggle',
  SHOW_OVERLAY: 'overlay:show',
  HIDE_OVERLAY: 'overlay:hide',
  OVERLAY_READY: 'overlay:ready',

  // AI
  AI_QUERY: 'ai:query',
  AI_STREAM_CHUNK: 'ai:stream-chunk',
  AI_STREAM_DONE: 'ai:stream-done',
  AI_STREAM_ERROR: 'ai:stream-error',
  AI_CANCEL: 'ai:cancel',

  // Screen capture
  SCREEN_CAPTURE: 'screen:capture',
  SCREEN_CAPTURE_PREVIEW: 'screen:capture-preview',
  SCREEN_CAPTURE_RESULT: 'screen:capture-result',
  SCREEN_CAPTURE_ERROR: 'screen:capture-error',

  // Audio
  AUDIO_START: 'audio:start',
  AUDIO_STOP: 'audio:stop',
  AUDIO_TRANSCRIPT: 'audio:transcript',
  AUDIO_STATUS: 'audio:status',

  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_GET_ALL: 'settings:get-all',

  // Models
  MODELS_FETCH: 'models:fetch',
  MODELS_LIST: 'models:list',

  // Hotkeys
  HOTKEY_ASK_AI: 'hotkey:ask-ai',
  HOTKEY_ASK_WITH_SCREENSHOT: 'hotkey:ask-with-screenshot',
  HOTKEY_TOGGLE_AUDIO: 'hotkey:toggle-audio',
  HOTKEY_TOGGLE_OVERLAY: 'hotkey:toggle-overlay',

  // Dashboard
  OPEN_DASHBOARD: 'dashboard:open',
  CLOSE_DASHBOARD: 'dashboard:close',

  // Context
  CONTEXT_GET: 'context:get',
  CONTEXT_SCREEN_TEXT: 'context:screen-text',
  CONTEXT_TRANSCRIPT: 'context:transcript',

  // Conversations
  CONVERSATIONS_LIST: 'conversations:list',
  CONVERSATIONS_SAVE: 'conversations:save',
  CONVERSATIONS_DELETE: 'conversations:delete',
  CONVERSATIONS_CLEAR: 'conversations:clear',

  // App
  APP_QUIT: 'app:quit',
  APP_VERSION: 'app:version'
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
