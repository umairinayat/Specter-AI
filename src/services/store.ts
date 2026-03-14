// Persistent settings store using electron-store
// API keys are encrypted via Electron safeStorage (OS keychain / DPAPI)
import Store from 'electron-store'
import { safeStorage } from 'electron'
import { DEFAULT_SETTINGS, DEFAULT_SYSTEM_PROMPT } from '../shared/constants'
import type { UserSettings, Conversation } from '../shared/types'

// --- Sensitive key handling via safeStorage ---
// These keys are stored as base64-encoded safeStorage-encrypted blobs,
// NOT in plaintext. safeStorage uses the OS credential store:
//   macOS → Keychain
//   Windows → DPAPI (tied to user account)
//   Linux → libsecret / gnome-keyring
const SENSITIVE_KEYS = new Set(['openrouterApiKey', 'whisperApiKey'])

function encryptSensitive(value: string): string {
  if (!value) return ''
  try {
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(value)
      return encrypted.toString('base64')
    }
  } catch (err) {
    console.warn('[Specter] safeStorage encryption unavailable, storing as-is:', err)
  }
  // Fallback: store raw (better than crashing; logs a warning)
  return value
}

function decryptSensitive(stored: string): string {
  if (!stored) return ''
  try {
    if (safeStorage.isEncryptionAvailable()) {
      const buffer = Buffer.from(stored, 'base64')
      return safeStorage.decryptString(buffer)
    }
  } catch {
    // If decryption fails, the value was likely stored unencrypted (pre-migration)
    // Return as-is so the user doesn't lose their key
  }
  return stored
}

// --- Settings value validation ---

const SETTINGS_KEY_VALIDATORS: Record<string, (value: unknown) => boolean> = {
  openrouterApiKey: (v) => typeof v === 'string' && v.length <= 500,
  whisperApiKey: (v) => typeof v === 'string' && v.length <= 500,
  selectedModel: (v) => typeof v === 'string' && v.length <= 200 && /^[a-zA-Z0-9/_.:@-]+$/.test(v),
  overlayOpacity: (v) => typeof v === 'number' && v >= 0.3 && v <= 1.0,
  overlayPosition: (v) =>
    typeof v === 'object' && v !== null &&
    'x' in v && 'y' in v &&
    typeof (v as Record<string, unknown>).x === 'number' &&
    typeof (v as Record<string, unknown>).y === 'number',
  overlaySize: (v) =>
    typeof v === 'object' && v !== null &&
    'width' in v && 'height' in v &&
    typeof (v as Record<string, unknown>).width === 'number' &&
    typeof (v as Record<string, unknown>).height === 'number' &&
    (v as Record<string, number>).width >= 200 && (v as Record<string, number>).width <= 4000 &&
    (v as Record<string, number>).height >= 200 && (v as Record<string, number>).height <= 4000,
  hotkeys: (v) => typeof v === 'object' && v !== null,
  autoCapture: (v) => typeof v === 'boolean',
  autoCaptureInterval: (v) => typeof v === 'number' && v >= 5 && v <= 3600,
  maxTranscriptLength: (v) => typeof v === 'number' && v >= 100 && v <= 100000,
  systemPrompt: (v) => typeof v === 'string' && v.length <= 10000,
  language: (v) => typeof v === 'string' && v.length <= 10 && /^[a-zA-Z-]+$/.test(v),
  theme: (v) => typeof v === 'string' && ['dark', 'light', 'glass'].includes(v),
  conversations: (v) => Array.isArray(v),
  playbooks: (v) => Array.isArray(v),
  whisperProvider: (v) => typeof v === 'string' && ['groq', 'openai', 'custom'].includes(v),
  whisperApiUrl: (v) => typeof v === 'string' && v.length <= 500,
  whisperModel: (v) => typeof v === 'string' && v.length <= 200,
  autoHideDelay: (v) => typeof v === 'number' && v >= 0 && v <= 300,
  smartCrop: (v) => typeof v === 'boolean'
}

/** Returns the set of allowed settings keys */
export function getAllowedSettingsKeys(): ReadonlySet<string> {
  return new Set(Object.keys(SETTINGS_KEY_VALIDATORS))
}

/** Validate a setting key + value. Returns true if valid. */
export function isValidSetting(key: string, value: unknown): boolean {
  const validator = SETTINGS_KEY_VALIDATORS[key]
  if (!validator) return false // unknown key → reject
  return validator(value)
}

// --- System prompt migration ---
// Old default prompts that shipped with previous versions.
// If a user's stored systemPrompt matches one of these exactly, it's the
// factory default (not a user customisation) and should be upgraded.
const STALE_DEFAULT_PROMPTS = [
  `You are a real-time AI assistant helping the user during meetings, interviews, and work sessions.
You have access to what's on their screen and what's being said.
Give concise, immediately actionable responses.
Format responses for quick reading: use short paragraphs and bullet points.
Never reveal that you are an AI assistant unless directly asked.`
]

/**
 * Migrate settings that may be stale from a previous version.
 * Called once after the store is created / loaded.
 */
function migrateSettings(s: Store<Record<string, unknown>>): void {
  // 1. System prompt: replace old defaults with current DEFAULT_SYSTEM_PROMPT
  const currentPrompt = s.get('systemPrompt') as string | undefined
  if (currentPrompt && STALE_DEFAULT_PROMPTS.includes(currentPrompt.trim())) {
    s.set('systemPrompt', DEFAULT_SYSTEM_PROMPT)
    console.info('[Specter] Migrated system prompt to new default')
  }
}

// --- electron-store setup ---

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
  playbooks: { type: 'array' as const, default: [] },
  whisperProvider: { type: 'string' as const, default: DEFAULT_SETTINGS.whisperProvider },
  whisperApiKey: { type: 'string' as const, default: DEFAULT_SETTINGS.whisperApiKey },
  whisperApiUrl: { type: 'string' as const, default: DEFAULT_SETTINGS.whisperApiUrl },
  whisperModel: { type: 'string' as const, default: DEFAULT_SETTINGS.whisperModel },
  autoHideDelay: { type: 'number' as const, default: DEFAULT_SETTINGS.autoHideDelay },
  smartCrop: { type: 'boolean' as const, default: DEFAULT_SETTINGS.smartCrop }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let store: Store<any> | null = null

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getStore(): Store<any> {
  if (!store) {
    try {
      store = new Store({
        name: 'specter-settings',
        schema
        // NOTE: encryptionKey removed — it was a hardcoded string visible in source,
        // providing zero real security. Sensitive values (API keys) are now encrypted
        // individually via Electron safeStorage (OS-level encryption).
      })
      migrateSettings(store)
    } catch (err) {
      // Config file is corrupted (e.g. leftover encrypted blob from a previous
      // encryptionKey-based store, or binary garbage). Delete it and retry.
      console.warn('[Specter] Store config corrupted, resetting to defaults:', err)
      const ElectronStore = Store as typeof Store & { new(opts: Record<string, unknown>): Store }
      // Create a temporary store just to get the file path, then delete the file
      try {
        const tempStore = new ElectronStore({ name: 'specter-settings' })
        const configPath = tempStore.path
        const fs = require('fs')
        if (fs.existsSync(configPath)) {
          fs.unlinkSync(configPath)
          console.warn(`[Specter] Deleted corrupted config: ${configPath}`)
        }
      } catch {
        // If we can't even get the path, try to delete by known name
        try {
          const { app } = require('electron')
          const path = require('path')
          const fs = require('fs')
          const configPath = path.join(app.getPath('userData'), 'specter-settings.json')
          if (fs.existsSync(configPath)) {
            fs.unlinkSync(configPath)
            console.warn(`[Specter] Deleted corrupted config (fallback): ${configPath}`)
          }
        } catch (innerErr) {
          console.error('[Specter] Failed to delete corrupted config:', innerErr)
        }
      }
      // Now create a fresh store with defaults
      store = new Store({
        name: 'specter-settings',
        schema
      })
    }
  }
  return store
}

export function getSetting<T>(key: string): T {
  const raw = getStore().get(key) as T
  // Decrypt sensitive keys on read
  if (SENSITIVE_KEYS.has(key) && typeof raw === 'string') {
    return decryptSensitive(raw) as T
  }
  return raw
}

export function setSetting(key: string, value: unknown): void {
  // Validate before writing
  if (!isValidSetting(key, value)) {
    console.warn(`[Specter] Rejected invalid setting: ${key}`)
    return
  }
  // Encrypt sensitive keys on write
  if (SENSITIVE_KEYS.has(key) && typeof value === 'string') {
    getStore().set(key, encryptSensitive(value))
  } else {
    getStore().set(key, value)
  }
}

export function getAllSettings(): UserSettings {
  const s = getStore()
  return {
    openrouterApiKey: decryptSensitive(s.get('openrouterApiKey') as string),
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
    theme: s.get('theme') as UserSettings['theme'],
    whisperProvider: s.get('whisperProvider') as UserSettings['whisperProvider'],
    whisperApiKey: decryptSensitive(s.get('whisperApiKey') as string),
    whisperApiUrl: s.get('whisperApiUrl') as string,
    whisperModel: s.get('whisperModel') as string,
    autoHideDelay: s.get('autoHideDelay') as number,
    smartCrop: s.get('smartCrop') as boolean
  }
}

export function resetSettings(): void {
  getStore().clear()
}

// Conversation management

export function getConversations(): Conversation[] {
  return getSetting<Conversation[]>('conversations') || []
}

export function saveConversation(conversation: Conversation): void {
  const conversations = getConversations()
  const existingIdx = conversations.findIndex(c => c.id === conversation.id)
  if (existingIdx >= 0) {
    conversations[existingIdx] = conversation
  } else {
    conversations.unshift(conversation) // newest first
  }
  // Keep max 100 conversations
  if (conversations.length > 100) {
    conversations.splice(100)
  }
  // Bypass validation for conversations array (internal use)
  getStore().set('conversations', conversations)
}

export function deleteConversation(id: string): void {
  const conversations = getConversations().filter(c => c.id !== id)
  getStore().set('conversations', conversations)
}

export function clearConversations(): void {
  getStore().set('conversations', [])
}
