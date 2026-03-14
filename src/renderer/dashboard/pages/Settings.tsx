// Settings page — API key, hotkeys, overlay config, audio transcription, system prompt
import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Key, Eye, EyeOff, Keyboard, Monitor, Sliders, MessageSquare,
  Save, RotateCcw, CheckCircle, AlertCircle, Loader2, Mic
} from 'lucide-react'

interface SettingsState {
  openrouterApiKey: string
  overlayOpacity: number
  autoCapture: boolean
  autoCaptureInterval: number
  maxTranscriptLength: number
  systemPrompt: string
  language: string
  theme: 'dark' | 'light' | 'glass'
  hotkeys: {
    askAI: string
    toggleOverlay: string
    toggleAudio: string
    screenshotAsk: string
  }
  // Whisper / audio transcription
  whisperProvider: 'groq' | 'openai' | 'custom'
  whisperApiKey: string
  whisperApiUrl: string
  whisperModel: string
  autoHideDelay: number
  smartCrop: boolean
}

const DEFAULT_STATE: SettingsState = {
  openrouterApiKey: '',
  overlayOpacity: 0.85,
  autoCapture: false,
  autoCaptureInterval: 30,
  maxTranscriptLength: 5000,
  systemPrompt: '',
  language: 'en',
  theme: 'dark',
  hotkeys: {
    askAI: 'CommandOrControl+Return',
    toggleOverlay: 'CommandOrControl+\\',
    toggleAudio: 'CommandOrControl+Shift+Space',
    screenshotAsk: 'CommandOrControl+Shift+Return'
  },
  whisperProvider: 'groq',
  whisperApiKey: '',
  whisperApiUrl: '',
  whisperModel: '',
  autoHideDelay: 0,
  smartCrop: false
}

export default function Settings() {
  const [settings, setSettings] = useState<SettingsState>(DEFAULT_STATE)
  const [showApiKey, setShowApiKey] = useState(false)
  const [showWhisperKey, setShowWhisperKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [validatingKey, setValidatingKey] = useState(false)
  const [keyValid, setKeyValid] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Hotkey recording state
  const [recordingHotkey, setRecordingHotkey] = useState<keyof SettingsState['hotkeys'] | null>(null)
  const hotkeyRecorderRef = useRef<HTMLButtonElement | null>(null)

  // Load settings on mount
  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      const all = await window.specterAPI.getAllSettings() as unknown as SettingsState
      setSettings({
        openrouterApiKey: all.openrouterApiKey || '',
        overlayOpacity: all.overlayOpacity || 0.85,
        autoCapture: all.autoCapture || false,
        autoCaptureInterval: all.autoCaptureInterval || 30,
        maxTranscriptLength: all.maxTranscriptLength || 5000,
        systemPrompt: all.systemPrompt || '',
        language: all.language || 'en',
        theme: all.theme || 'dark',
        hotkeys: all.hotkeys || DEFAULT_STATE.hotkeys,
        whisperProvider: all.whisperProvider || 'groq',
        whisperApiKey: all.whisperApiKey || '',
        whisperApiUrl: all.whisperApiUrl || '',
        whisperModel: all.whisperModel || '',
        autoHideDelay: typeof all.autoHideDelay === 'number' ? all.autoHideDelay : 0,
        smartCrop: all.smartCrop || false
      })
    } catch (err) {
      console.error('Failed to load settings:', err)
    }
  }

  const handleSave = useCallback(async () => {
    setSaving(true)
    setError(null)
    try {
      const api = window.specterAPI
      await api.setSetting('openrouterApiKey', settings.openrouterApiKey)
      await api.setSetting('overlayOpacity', settings.overlayOpacity)
      await api.setSetting('autoCapture', settings.autoCapture)
      await api.setSetting('autoCaptureInterval', settings.autoCaptureInterval)
      await api.setSetting('maxTranscriptLength', settings.maxTranscriptLength)
      await api.setSetting('systemPrompt', settings.systemPrompt)
      await api.setSetting('language', settings.language)
      await api.setSetting('theme', settings.theme)
      await api.setSetting('hotkeys', settings.hotkeys)
      await api.setSetting('whisperProvider', settings.whisperProvider)
      await api.setSetting('whisperApiKey', settings.whisperApiKey)
      await api.setSetting('whisperApiUrl', settings.whisperApiUrl)
      await api.setSetting('whisperModel', settings.whisperModel)
      await api.setSetting('autoHideDelay', settings.autoHideDelay)
      await api.setSetting('smartCrop', settings.smartCrop)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }, [settings])

  const handleValidateKey = useCallback(async () => {
    if (!settings.openrouterApiKey.trim()) return
    setValidatingKey(true)
    setKeyValid(null)
    try {
      // Save the key first so fetchModels can use it
      await window.specterAPI.setSetting('openrouterApiKey', settings.openrouterApiKey)
      const models = await window.specterAPI.fetchModels()
      setKeyValid(models.length > 0)
    } catch {
      setKeyValid(false)
    } finally {
      setValidatingKey(false)
    }
  }, [settings.openrouterApiKey])

  const handleReset = useCallback(async () => {
    setSettings(DEFAULT_STATE)
  }, [])

  const updateSetting = <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }))
  }

  /**
   * Convert a KeyboardEvent into an Electron accelerator string.
   * e.g. Ctrl+Shift+A, CommandOrControl+Return
   */
  const keyEventToAccelerator = useCallback((e: KeyboardEvent): string | null => {
    // Ignore lone modifier presses
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return null

    const parts: string[] = []
    if (e.ctrlKey || e.metaKey) parts.push('CommandOrControl')
    if (e.shiftKey) parts.push('Shift')
    if (e.altKey) parts.push('Alt')

    // Must have at least one modifier
    if (parts.length === 0) return null

    // Map special keys to Electron names
    const keyMap: Record<string, string> = {
      Enter: 'Return', Backspace: 'Backspace', Delete: 'Delete', Tab: 'Tab',
      Escape: 'Escape', ' ': 'Space', ArrowUp: 'Up', ArrowDown: 'Down',
      ArrowLeft: 'Left', ArrowRight: 'Right', '\\': '\\', '/': '/',
      '-': '-', '=': '=', '[': '[', ']': ']', ';': ';', "'": "'",
      ',': ',', '.': '.', '`': '`'
    }

    let key = keyMap[e.key] || e.key.toUpperCase()
    // Function keys (F1-F24)
    if (/^F\d{1,2}$/.test(e.key)) key = e.key

    parts.push(key)
    return parts.join('+')
  }, [])

  // Hotkey recording: listen for key combos when recording
  useEffect(() => {
    if (!recordingHotkey) return

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()

      // Escape cancels recording
      if (e.key === 'Escape') {
        setRecordingHotkey(null)
        return
      }

      const accelerator = keyEventToAccelerator(e)
      if (accelerator) {
        setSettings(prev => ({
          ...prev,
          hotkeys: { ...prev.hotkeys, [recordingHotkey]: accelerator }
        }))
        setRecordingHotkey(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [recordingHotkey, keyEventToAccelerator])

  /** Format an Electron accelerator for display */
  const formatAccelerator = (accel: string): string => {
    return accel
      .replace('CommandOrControl', 'Ctrl')
      .replace('Return', 'Enter')
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h2 className="text-xl font-semibold text-white/90">Settings</h2>
        <p className="text-sm text-white/40 mt-1">Configure your Specter AI experience</p>
      </div>

      {/* API Key */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 text-white/60">
          <Key className="w-4 h-4 text-violet-400" />
          <h3 className="text-sm font-medium">OpenRouter API Key</h3>
        </div>
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={settings.openrouterApiKey}
                onChange={(e) => {
                  updateSetting('openrouterApiKey', e.target.value)
                  setKeyValid(null)
                }}
                placeholder="sk-or-v1-..."
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm
                           text-white/90 placeholder-white/20 focus:border-violet-500/40
                           focus:outline-none transition-colors"
              />
              <button
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
              >
                {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <button
              onClick={handleValidateKey}
              disabled={validatingKey || !settings.openrouterApiKey.trim()}
              className="px-4 py-2.5 rounded-xl bg-violet-500/20 text-violet-300 text-sm
                         hover:bg-violet-500/30 disabled:opacity-30 disabled:cursor-not-allowed
                         transition-colors flex items-center gap-2"
            >
              {validatingKey ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : keyValid === true ? (
                <CheckCircle className="w-4 h-4 text-emerald-400" />
              ) : keyValid === false ? (
                <AlertCircle className="w-4 h-4 text-red-400" />
              ) : null}
              Validate
            </button>
          </div>
          {keyValid === true && (
            <p className="text-emerald-400 text-xs">API key is valid</p>
          )}
          {keyValid === false && (
            <p className="text-red-400 text-xs">Invalid API key. Check your key and try again.</p>
          )}
          <p className="text-white/20 text-xs">
            Get your API key from{' '}
            <span className="text-violet-400/60">openrouter.ai/keys</span>
          </p>
        </div>
      </section>

      {/* Audio Transcription (Whisper) */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 text-white/60">
          <Mic className="w-4 h-4 text-violet-400" />
          <h3 className="text-sm font-medium">Audio Transcription (Whisper)</h3>
        </div>
        <div className="space-y-4">
          <p className="text-white/30 text-xs leading-relaxed">
            Audio transcription requires a Whisper-compatible API.
            Groq offers a <strong className="text-white/50">free</strong> Whisper endpoint &mdash;
            get a key at <span className="text-violet-400/60">console.groq.com</span>
          </p>

          {/* Provider selector */}
          <div>
            <label className="text-sm text-white/50 block mb-2">Transcription Provider</label>
            <div className="flex gap-2">
              {([
                { value: 'groq', label: 'Groq (Free)', desc: 'whisper-large-v3-turbo' },
                { value: 'openai', label: 'OpenAI', desc: 'whisper-1' },
                { value: 'custom', label: 'Custom', desc: 'Your endpoint' }
              ] as const).map((provider) => (
                <button
                  key={provider.value}
                  onClick={() => updateSetting('whisperProvider', provider.value)}
                  className={`flex-1 px-3 py-2.5 rounded-xl text-sm transition-colors text-left ${
                    settings.whisperProvider === provider.value
                      ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                      : 'bg-white/5 text-white/40 border border-white/10 hover:border-white/20'
                  }`}
                >
                  <div className="font-medium">{provider.label}</div>
                  <div className="text-[10px] text-white/20 mt-0.5">{provider.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Whisper API Key */}
          <div>
            <label className="text-sm text-white/50 block mb-2">
              {settings.whisperProvider === 'groq' ? 'Groq' : settings.whisperProvider === 'openai' ? 'OpenAI' : 'Whisper'} API Key
            </label>
            <div className="relative">
              <input
                type={showWhisperKey ? 'text' : 'password'}
                value={settings.whisperApiKey}
                onChange={(e) => updateSetting('whisperApiKey', e.target.value)}
                placeholder={
                  settings.whisperProvider === 'groq' ? 'gsk_...' :
                  settings.whisperProvider === 'openai' ? 'sk-...' :
                  'API key for your endpoint'
                }
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm
                           text-white/90 placeholder-white/20 focus:border-violet-500/40
                           focus:outline-none transition-colors"
              />
              <button
                onClick={() => setShowWhisperKey(!showWhisperKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
              >
                {showWhisperKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-white/20 text-xs mt-1.5">
              {settings.whisperProvider === 'groq'
                ? 'Free Groq API key from console.groq.com — generous free tier for Whisper.'
                : settings.whisperProvider === 'openai'
                  ? 'OpenAI API key from platform.openai.com. Whisper usage is billed separately.'
                  : 'API key for your custom Whisper-compatible endpoint.'
              }
            </p>
          </div>

          {/* Custom endpoint fields */}
          {settings.whisperProvider === 'custom' && (
            <>
              <div>
                <label className="text-sm text-white/50 block mb-2">Custom Endpoint URL</label>
                <input
                  type="text"
                  value={settings.whisperApiUrl}
                  onChange={(e) => updateSetting('whisperApiUrl', e.target.value)}
                  placeholder="https://your-api.example.com/v1/audio/transcriptions"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm
                             text-white/90 placeholder-white/20 focus:border-violet-500/40
                             focus:outline-none transition-colors"
                />
              </div>
              <div>
                <label className="text-sm text-white/50 block mb-2">Model Name</label>
                <input
                  type="text"
                  value={settings.whisperModel}
                  onChange={(e) => updateSetting('whisperModel', e.target.value)}
                  placeholder="whisper-1"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm
                             text-white/90 placeholder-white/20 focus:border-violet-500/40
                             focus:outline-none transition-colors"
                />
              </div>
            </>
          )}
        </div>
      </section>

      {/* Overlay Settings */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 text-white/60">
          <Monitor className="w-4 h-4 text-violet-400" />
          <h3 className="text-sm font-medium">Overlay</h3>
        </div>
        <div className="space-y-4">
          {/* Opacity */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-white/50">Opacity</label>
              <span className="text-xs text-white/30 font-mono">
                {Math.round(settings.overlayOpacity * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0.3"
              max="1"
              step="0.05"
              value={settings.overlayOpacity}
              onChange={(e) => updateSetting('overlayOpacity', parseFloat(e.target.value))}
              className="w-full accent-violet-500"
            />
          </div>

          {/* Theme */}
          <div>
            <label className="text-sm text-white/50 block mb-2">Theme</label>
            <div className="flex gap-2">
              {(['dark', 'light', 'glass'] as const).map((theme) => (
                <button
                  key={theme}
                  onClick={() => updateSetting('theme', theme)}
                  className={`px-4 py-2 rounded-xl text-sm capitalize transition-colors ${
                    settings.theme === theme
                      ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                      : 'bg-white/5 text-white/40 border border-white/10 hover:border-white/20'
                  }`}
                >
                  {theme}
                </button>
              ))}
            </div>
          </div>

          {/* Auto-hide */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div>
                <label className="text-sm text-white/50">Auto-hide Overlay</label>
                <p className="text-xs text-white/20 mt-0.5">Minimize overlay after inactivity (0 = disabled)</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max="300"
                value={settings.autoHideDelay}
                onChange={(e) => updateSetting('autoHideDelay', parseInt(e.target.value) || 0)}
                className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm
                           text-white/90 focus:border-violet-500/40 focus:outline-none w-24"
              />
              <span className="text-xs text-white/30">seconds</span>
            </div>
          </div>

          {/* Language */}
          <div>
            <label className="text-sm text-white/50 block mb-2">Transcription Language</label>
            <select
              value={settings.language}
              onChange={(e) => updateSetting('language', e.target.value)}
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm
                         text-white/90 focus:border-violet-500/40 focus:outline-none w-full"
            >
              <option value="en">English</option>
              <option value="es">Spanish</option>
              <option value="fr">French</option>
              <option value="de">German</option>
              <option value="ja">Japanese</option>
              <option value="zh">Chinese</option>
              <option value="ko">Korean</option>
              <option value="pt">Portuguese</option>
              <option value="ru">Russian</option>
              <option value="ar">Arabic</option>
            </select>
          </div>
        </div>
      </section>

      {/* Screen Capture Settings */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 text-white/60">
          <Sliders className="w-4 h-4 text-violet-400" />
          <h3 className="text-sm font-medium">Screen Capture</h3>
        </div>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm text-white/50">Auto-capture</label>
              <p className="text-xs text-white/20 mt-0.5">Periodically capture screen for context</p>
            </div>
            <button
              onClick={() => updateSetting('autoCapture', !settings.autoCapture)}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                settings.autoCapture ? 'bg-violet-500' : 'bg-white/10'
              }`}
            >
              <div
                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  settings.autoCapture ? 'translate-x-[22px]' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          {/* Smart Crop — active window only */}
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm text-white/50">Smart Crop</label>
              <p className="text-xs text-white/20 mt-0.5">Capture only the active window instead of the full screen</p>
            </div>
            <button
              onClick={() => updateSetting('smartCrop', !settings.smartCrop)}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                settings.smartCrop ? 'bg-violet-500' : 'bg-white/10'
              }`}
            >
              <div
                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  settings.smartCrop ? 'translate-x-[22px]' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          {settings.autoCapture && (
            <div>
              <label className="text-sm text-white/50 block mb-2">
                Capture interval (seconds)
              </label>
              <input
                type="number"
                min="5"
                max="300"
                value={settings.autoCaptureInterval}
                onChange={(e) => updateSetting('autoCaptureInterval', parseInt(e.target.value) || 30)}
                className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm
                           text-white/90 focus:border-violet-500/40 focus:outline-none w-32"
              />
            </div>
          )}

          <div>
            <label className="text-sm text-white/50 block mb-2">
              Max transcript length (chars)
            </label>
            <input
              type="number"
              min="500"
              max="20000"
              step="500"
              value={settings.maxTranscriptLength}
              onChange={(e) => updateSetting('maxTranscriptLength', parseInt(e.target.value) || 5000)}
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm
                         text-white/90 focus:border-violet-500/40 focus:outline-none w-40"
            />
          </div>
        </div>
      </section>

      {/* Hotkeys */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 text-white/60">
          <Keyboard className="w-4 h-4 text-violet-400" />
          <h3 className="text-sm font-medium">Keyboard Shortcuts</h3>
        </div>
        <p className="text-white/20 text-xs">Click a shortcut to record a new key combination. Press Escape to cancel.</p>
        <div className="space-y-3">
          {([
            { key: 'askAI' as const, label: 'Ask AI', desc: 'Trigger AI with current context' },
            { key: 'toggleOverlay' as const, label: 'Toggle Overlay', desc: 'Show/hide the overlay' },
            { key: 'toggleAudio' as const, label: 'Toggle Audio', desc: 'Start/stop recording' },
            { key: 'screenshotAsk' as const, label: 'Screenshot + Ask', desc: 'Capture screen and ask AI' }
          ]).map((item) => (
            <div key={item.key} className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm text-white/60">{item.label}</p>
                <p className="text-xs text-white/20">{item.desc}</p>
              </div>
              <button
                ref={recordingHotkey === item.key ? hotkeyRecorderRef : undefined}
                onClick={() => setRecordingHotkey(recordingHotkey === item.key ? null : item.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-colors cursor-pointer ${
                  recordingHotkey === item.key
                    ? 'bg-violet-500/30 border border-violet-500/60 text-violet-300 animate-pulse'
                    : 'bg-white/5 border border-white/10 text-white/50 hover:border-violet-500/30 hover:text-white/70'
                }`}
                title={recordingHotkey === item.key ? 'Press a key combo or Escape to cancel' : 'Click to change shortcut'}
              >
                {recordingHotkey === item.key
                  ? 'Press keys...'
                  : formatAccelerator(settings.hotkeys[item.key])
                }
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* System Prompt */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 text-white/60">
          <MessageSquare className="w-4 h-4 text-violet-400" />
          <h3 className="text-sm font-medium">Custom System Prompt</h3>
        </div>
        <textarea
          value={settings.systemPrompt}
          onChange={(e) => updateSetting('systemPrompt', e.target.value)}
          placeholder="Leave empty to use default. Custom system prompts override the built-in prompt."
          rows={5}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm
                     text-white/90 placeholder-white/20 focus:border-violet-500/40
                     focus:outline-none resize-y min-h-[100px] transition-colors"
        />
        <p className="text-white/20 text-xs">
          The system prompt instructs the AI how to behave. Leave empty to use the default prompt.
        </p>
      </section>

      {/* Action buttons */}
      <div className="flex items-center gap-3 pt-4 border-t border-white/5">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-500 text-white
                     text-sm font-medium hover:bg-violet-600 disabled:opacity-50
                     transition-colors"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : saved ? (
            <CheckCircle className="w-4 h-4" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {saved ? 'Saved!' : 'Save Settings'}
        </button>
        <button
          onClick={handleReset}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 text-white/50
                     text-sm hover:bg-white/10 hover:text-white/70 transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
          Reset to Defaults
        </button>
        {error && (
          <p className="text-red-400 text-xs ml-auto">{error}</p>
        )}
      </div>
    </div>
  )
}
