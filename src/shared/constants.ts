// App-wide constants for Specter AI

export const APP_NAME = 'Specter AI'
export const APP_ID = 'com.specter.ai'
export const APP_VERSION = '1.0.0'

export const ACCENT_COLOR = '#7C3AED' // violet
export const ACCENT_COLOR_RGB = '124, 58, 237'

export const OVERLAY_DEFAULTS = {
  width: 420,
  height: 600,
  opacity: 0.85,
  margin: 20
}

export const DEFAULT_SYSTEM_PROMPT = `You are a real-time AI assistant helping the user during meetings, interviews, and work sessions.
You have access to what's on their screen and what's being said.
Give concise, immediately actionable responses.
Format responses for quick reading: use short paragraphs and bullet points.
Never reveal that you are an AI assistant unless directly asked.`

export const DEFAULT_HOTKEYS = {
  askAI: 'CommandOrControl+Return',
  toggleOverlay: 'CommandOrControl+\\',
  toggleAudio: 'CommandOrControl+Shift+Space',
  screenshotAsk: 'CommandOrControl+Shift+Return'
}

export const DEFAULT_MODELS = [
  {
    id: 'google/gemini-flash-1.5',
    name: 'Gemini Flash 1.5 (Recommended - Fast)',
    pricing: { prompt: '0.000075', completion: '0.0003' },
    context_length: 1000000,
    description: 'Ultra-fast responses, great for real-time use'
  },
  {
    id: 'anthropic/claude-3-haiku',
    name: 'Claude 3 Haiku (Balanced)',
    pricing: { prompt: '0.0008', completion: '0.004' },
    context_length: 200000,
    description: 'High quality with good speed'
  },
  {
    id: 'deepseek/deepseek-chat',
    name: 'DeepSeek Chat (Cost-Effective)',
    pricing: { prompt: '0.00014', completion: '0.00028' },
    context_length: 64000,
    description: 'Great quality at low cost'
  },
  {
    id: 'meta-llama/llama-3.1-8b-instruct:free',
    name: 'Llama 3.1 8B (Free)',
    pricing: { prompt: '0', completion: '0' },
    context_length: 131072,
    description: 'Free tier for testing'
  }
]

export const DEFAULT_SETTINGS = {
  openrouterApiKey: '',
  selectedModel: 'google/gemini-flash-1.5',
  overlayOpacity: 0.85,
  overlayPosition: { x: -1, y: -1 }, // -1 means auto-position
  overlaySize: { width: 420, height: 600 },
  hotkeys: DEFAULT_HOTKEYS,
  autoCapture: false,
  autoCaptureInterval: 30,
  maxTranscriptLength: 5000,
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  language: 'en',
  theme: 'dark' as const
}

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
export const OPENROUTER_REFERER = 'https://github.com/specter-ai'
export const OPENROUTER_TITLE = 'Specter AI'
