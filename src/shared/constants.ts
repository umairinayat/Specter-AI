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
    id: 'google/gemini-3-flash-preview',
    name: 'Gemini 3 Flash (Recommended - Fast)',
    pricing: { prompt: '0.0000005', completion: '0.000003' },
    context_length: 1048576,
    description: 'Ultra-fast responses, great for real-time use'
  },
  {
    id: 'anthropic/claude-sonnet-4',
    name: 'Claude Sonnet 4 (High Quality)',
    pricing: { prompt: '0.003', completion: '0.015' },
    context_length: 200000,
    description: 'Top-tier quality and reasoning'
  },
  {
    id: 'deepseek/deepseek-chat',
    name: 'DeepSeek V3 (Cost-Effective)',
    pricing: { prompt: '0.00032', completion: '0.00089' },
    context_length: 163840,
    description: 'Great quality at low cost'
  },
  {
    id: 'meta-llama/llama-4-maverick',
    name: 'Llama 4 Maverick (1M Context)',
    pricing: { prompt: '0.00015', completion: '0.0006' },
    context_length: 1048576,
    description: 'Latest Llama model with massive context'
  },
  {
    id: 'meta-llama/llama-3.3-70b-instruct',
    name: 'Llama 3.3 70B Instruct',
    pricing: { prompt: '0.0001', completion: '0.00032' },
    context_length: 131072,
    description: 'Strong open-source model'
  },
  {
    id: 'meta-llama/llama-3.1-8b-instruct',
    name: 'Llama 3.1 8B Instruct (Budget)',
    pricing: { prompt: '0.00002', completion: '0.00005' },
    context_length: 16384,
    description: 'Fast and extremely cheap'
  },
  {
    id: 'upstage/solar-pro-3:free',
    name: 'Solar Pro 3 (Free)',
    pricing: { prompt: '0', completion: '0' },
    context_length: 128000,
    description: 'Free tier for testing'
  }
]

export const DEFAULT_SETTINGS = {
  openrouterApiKey: '',
  selectedModel: 'google/gemini-3-flash-preview',
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
