// Shared type definitions for Specter AI

export interface UserSettings {
  openrouterApiKey: string
  selectedModel: string
  overlayOpacity: number
  overlayPosition: { x: number; y: number }
  overlaySize: { width: number; height: number }
  hotkeys: {
    askAI: string
    toggleOverlay: string
    toggleAudio: string
    screenshotAsk: string
  }
  autoCapture: boolean
  autoCaptureInterval: number
  maxTranscriptLength: number
  systemPrompt: string
  language: string
  theme: 'dark' | 'light' | 'glass'
  // Whisper / audio transcription
  whisperProvider: 'groq' | 'openai' | 'custom'
  whisperApiKey: string
  whisperApiUrl: string
  whisperModel: string
  // UX
  autoHideDelay: number // seconds, 0 = disabled
  smartCrop: boolean    // capture active window only (vs full screen)
}

export interface OpenRouterModel {
  id: string
  name: string
  pricing: {
    prompt: string
    completion: string
  }
  context_length: number
  description?: string
}

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  tokenCount?: number
  cost?: number
}

export interface Conversation {
  id: string
  title: string
  messages: Message[]
  model: string
  createdAt: number
  updatedAt: number
}

export interface ContextSnapshot {
  screenText: string
  transcript: string
  userQuery?: string
  screenshot?: string // base64
}

export interface AudioStatus {
  isRecording: boolean
  duration: number
  error?: string
}

export interface ScreenCaptureResult {
  text: string
  screenshot?: string // base64
  timestamp: number
}

export interface CostEstimate {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  totalCost: number
  model: string
}

export interface Playbook {
  id: string
  name: string
  content: string
  isActive: boolean
  createdAt: number
}
