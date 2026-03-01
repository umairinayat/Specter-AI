// Persistent settings store using electron-store
import Store from 'electron-store'
import { DEFAULT_SETTINGS } from '../shared/constants'
import type { UserSettings } from '../shared/types'

const schema = {
  openrouterApiKey: { type: 'string' as const, default: DEFAULT_SETTINGS.openrouterApiKey },
  selectedModel: { type: 'string' as const, default: DEFAULT_SETTINGS.selectedModel },
  overlayOpacity: { type: 'number' as const, default: DEFAULT_SETTINGS.overlayOpacity, minimum: 0.3, maximum: 1.0 },
  overlayPosition: {
    type: 'object' as const,
    properties: {
      x: { type: 'number' as const },
      y: { type: 'number' as const }
    },
    default: DEFAULT_SETTINGS.overlayPosition
  },
  overlaySize: {
    type: 'object' as const,
    properties: {
      width: { type: 'number' as const },
      height: { type: 'number' as const }
    },
    default: DEFAULT_SETTINGS.overlaySize
  },
  hotkeys: {
    type: 'object' as const,
    default: DEFAULT_SETTINGS.hotkeys
  },
  autoCapture: { type: 'boolean' as const, default: DEFAULT_SETTINGS.autoCapture },
  autoCaptureInterval: { type: 'number' as const, default: DEFAULT_SETTINGS.autoCaptureInterval },
  maxTranscriptLength: { type: 'number' as const, default: DEFAULT_SETTINGS.maxTranscriptLength },
  systemPrompt: { type: 'string' as const, default: DEFAULT_SETTINGS.systemPrompt },
  language: { type: 'string' as const, default: DEFAULT_SETTINGS.language },
  theme: { type: 'string' as const, default: DEFAULT_SETTINGS.theme },
  conversations: { type: 'array' as const, default: [] },
  playbooks: { type: 'array' as const, default: [] }
}

let store: Store | null = null

export function getStore(): Store {
  if (!store) {
    store = new Store({
      name: 'specter-settings',
      schema,
      encryptionKey: 'specter-ai-secure-key-v1'
    })
  }
  return store
}

export function getSetting<T>(key: string): T {
  return getStore().get(key) as T
}

export function setSetting(key: string, value: unknown): void {
  getStore().set(key, value)
}

export function getAllSettings(): UserSettings {
  const s = getStore()
  return {
    openrouterApiKey: s.get('openrouterApiKey') as string,
    selectedModel: s.get('selectedModel') as string,
    overlayOpacity: s.get('overlayOpacity') as number,
    overlayPosition: s.get('overlayPosition') as { x: number; y: number },
    overlaySize: s.get('overlaySize') as { width: number; height: number },
    hotkeys: s.get('hotkeys') as UserSettings['hotkeys'],
    autoCapture: s.get('autoCapture') as boolean,
    autoCaptureInterval: s.get('autoCaptureInterval') as number,
    maxTranscriptLength: s.get('maxTranscriptLength') as number,
    systemPrompt: s.get('systemPrompt') as string,
    language: s.get('language') as string,
    theme: s.get('theme') as UserSettings['theme']
  }
}

export function resetSettings(): void {
  getStore().clear()
}
