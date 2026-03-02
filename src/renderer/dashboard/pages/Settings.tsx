// Settings page — API key, hotkeys, overlay config, system prompt
import { useState, useEffect, useCallback } from 'react'
import {
  Key, Eye, EyeOff, Keyboard, Monitor, Sliders, MessageSquare,
  Save, RotateCcw, CheckCircle, AlertCircle, Loader2
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
  }
}

export default function Settings() {
  const [settings, setSettings] = useState<SettingsState>(DEFAULT_STATE)
  const [showApiKey, setShowApiKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [validatingKey, setValidatingKey] = useState(false)
  const [keyValid, setKeyValid] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)

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
        hotkeys: all.hotkeys || DEFAULT_STATE.hotkeys
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
              <kbd className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/50
                             text-xs font-mono">
                {settings.hotkeys[item.key].replace('CommandOrControl', 'Ctrl').replace('Return', 'Enter')}
              </kbd>
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
