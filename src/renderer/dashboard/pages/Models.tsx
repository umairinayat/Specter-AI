// Models page — select AI model for OpenRouter, OpenAI API, or Codex Plan
import { useState, useEffect, useCallback } from 'react'
import {
  Cpu, Search, Check, DollarSign, Hash,
  Loader2, RefreshCw, Star, ChevronDown, ChevronUp
} from 'lucide-react'
import { DEFAULT_SETTINGS } from '../../../shared/constants'

type AiProvider = 'openrouter' | 'openai' | 'codex'

interface Model {
  id: string
  name: string
  pricing: { prompt: string; completion: string }
  context_length: number
  description?: string
}

const PROVIDERS: Array<{ value: AiProvider; label: string; desc: string }> = [
  { value: 'openrouter', label: 'OpenRouter', desc: 'API key' },
  { value: 'openai', label: 'OpenAI API', desc: 'GPT credits' },
  { value: 'codex', label: 'Codex Plan', desc: 'ChatGPT login' }
]

const OPENROUTER_RECOMMENDED_MODELS = [
  'google/gemini-3-flash-preview',
  'anthropic/claude-sonnet-4',
  'deepseek/deepseek-chat',
  'meta-llama/llama-4-maverick',
  'meta-llama/llama-3.3-70b-instruct',
  'meta-llama/llama-3.1-8b-instruct',
  'upstage/solar-pro-3:free'
]

const OPENAI_RECOMMENDED_MODELS = [
  'gpt-5.5',
  'gpt-5.4',
  'gpt-5.4-mini',
  'gpt-5.4-nano'
]

const CODEX_RECOMMENDED_MODELS = [
  'gpt-5.4',
  'gpt-5.3-codex'
]

const OPENROUTER_DEFAULT_MODELS: Model[] = [
  {
    id: 'google/gemini-3-flash-preview',
    name: 'Gemini 3 Flash',
    pricing: { prompt: '0.0000005', completion: '0.000003' },
    context_length: 1048576,
    description: 'Ultra-fast responses, great for real-time use'
  },
  {
    id: 'anthropic/claude-sonnet-4',
    name: 'Claude Sonnet 4',
    pricing: { prompt: '0.003', completion: '0.015' },
    context_length: 200000,
    description: 'Top-tier quality and reasoning'
  },
  {
    id: 'deepseek/deepseek-chat',
    name: 'DeepSeek V3',
    pricing: { prompt: '0.00032', completion: '0.00089' },
    context_length: 163840,
    description: 'Great quality at low cost'
  },
  {
    id: 'meta-llama/llama-4-maverick',
    name: 'Llama 4 Maverick',
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
    name: 'Llama 3.1 8B Instruct',
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

const OPENAI_MODELS: Model[] = [
  {
    id: 'gpt-5.5',
    name: 'GPT-5.5',
    pricing: { prompt: '0.000005', completion: '0.00003' },
    context_length: 1050000,
    description: 'Latest flagship model for complex reasoning and coding'
  },
  {
    id: 'gpt-5.5-pro',
    name: 'GPT-5.5 Pro',
    pricing: { prompt: '0.00003', completion: '0.00018' },
    context_length: 1050000,
    description: 'Maximum quality for hard tasks; higher latency and cost'
  },
  {
    id: 'gpt-5.4',
    name: 'GPT-5.4',
    pricing: { prompt: '0.0000025', completion: '0.000015' },
    context_length: 0,
    description: 'Previous default model; strong quality at lower cost'
  },
  {
    id: 'gpt-5.4-mini',
    name: 'GPT-5.4 Mini',
    pricing: { prompt: '0.00000075', completion: '0.0000045' },
    context_length: 0,
    description: 'Lower-cost model for lighter production workflows'
  },
  {
    id: 'gpt-5.4-nano',
    name: 'GPT-5.4 Nano',
    pricing: { prompt: '0.0000002', completion: '0.00000125' },
    context_length: 0,
    description: 'Fast, cheap model for simple high-volume tasks'
  },
  {
    id: 'chat-latest',
    name: 'Chat Latest',
    pricing: { prompt: '0.000005', completion: '0.00003' },
    context_length: 400000,
    description: 'Latest instant model used in ChatGPT'
  }
]

const CODEX_MODELS: Model[] = [
  {
    id: 'gpt-5.4',
    name: 'GPT-5.4',
    pricing: { prompt: '0', completion: '0' },
    context_length: 0,
    description: 'Compatible Codex model for the currently installed CLI'
  },
  {
    id: 'gpt-5.3-codex',
    name: 'GPT-5.3 Codex',
    pricing: { prompt: '0', completion: '0' },
    context_length: 0,
    description: 'Agentic coding model for Codex workflows'
  },
  {
    id: 'gpt-5.5',
    name: 'GPT-5.5',
    pricing: { prompt: '0', completion: '0' },
    context_length: 0,
    description: 'Requires a current Codex CLI version'
  }
]

function modelSettingKey(provider: AiProvider): 'selectedModel' | 'openaiModel' | 'codexModel' {
  if (provider === 'openai') return 'openaiModel'
  if (provider === 'codex') return 'codexModel'
  return 'selectedModel'
}

function defaultModelFor(provider: AiProvider): string {
  if (provider === 'openai') return DEFAULT_SETTINGS.openaiModel
  if (provider === 'codex') return DEFAULT_SETTINGS.codexModel
  return DEFAULT_SETTINGS.selectedModel
}

function modelsFor(provider: AiProvider, fetchedModels: Model[]): Model[] {
  if (provider === 'openai') return OPENAI_MODELS
  if (provider === 'codex') return CODEX_MODELS
  return fetchedModels.length > 0 ? fetchedModels : OPENROUTER_DEFAULT_MODELS
}

function recommendedFor(provider: AiProvider): string[] {
  if (provider === 'openai') return OPENAI_RECOMMENDED_MODELS
  if (provider === 'codex') return CODEX_RECOMMENDED_MODELS
  return OPENROUTER_RECOMMENDED_MODELS
}

function formatPrice(price: string, provider: AiProvider): string {
  if (provider === 'codex') return 'Plan'
  const num = parseFloat(price)
  if (num === 0) return 'Free'
  return `$${(num * 1000000).toFixed(2)}/M`
}

function formatContextLength(len: number): string {
  if (!len) return 'Docs'
  if (len >= 1000000) return `${(len / 1000000).toFixed(1)}M`
  if (len >= 1000) return `${Math.round(len / 1000)}k`
  return `${len}`
}

export default function Models() {
  const [aiProvider, setAiProvider] = useState<AiProvider>('openrouter')
  const [models, setModels] = useState<Model[]>([])
  const [selectedModel, setSelectedModel] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [saving, setSaving] = useState(false)

  const loadCurrentModel = useCallback(async () => {
    try {
      const provider = await window.specterAPI.getSetting<AiProvider>('aiProvider') || 'openrouter'
      const key = modelSettingKey(provider)
      const model = await window.specterAPI.getSetting<string>(key)
      setAiProvider(provider)
      setSelectedModel(model || defaultModelFor(provider))
    } catch (err) {
      console.error('Failed to load current model:', err)
    }
  }, [])

  useEffect(() => {
    loadCurrentModel()
  }, [loadCurrentModel])

  const handleSelectProvider = useCallback(async (provider: AiProvider) => {
    setSaving(true)
    setError(null)
    setShowAll(false)
    setSearchQuery('')
    setModels([])
    try {
      await window.specterAPI.setSetting('aiProvider', provider)
      const key = modelSettingKey(provider)
      const model = await window.specterAPI.getSetting<string>(key)
      setAiProvider(provider)
      setSelectedModel(model || defaultModelFor(provider))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to switch provider.')
    } finally {
      setSaving(false)
    }
  }, [])

  const fetchModels = useCallback(async () => {
    if (aiProvider !== 'openrouter') return
    setLoading(true)
    setError(null)
    try {
      const fetched = await window.specterAPI.fetchModels()
      setModels(fetched)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch models. Check your API key.')
    } finally {
      setLoading(false)
    }
  }, [aiProvider])

  const handleSelectModel = useCallback(async (modelId: string) => {
    setSaving(true)
    try {
      await window.specterAPI.setSetting(modelSettingKey(aiProvider), modelId)
      setSelectedModel(modelId)
    } catch (err) {
      console.error('Failed to save model:', err)
    } finally {
      setSaving(false)
    }
  }, [aiProvider])

  const provider = PROVIDERS.find((p) => p.value === aiProvider) || PROVIDERS[0]
  const displayModels = modelsFor(aiProvider, models)
  const recommendedModels = recommendedFor(aiProvider)

  const filteredModels = displayModels.filter((m) => {
    if (!searchQuery) return showAll || recommendedModels.includes(m.id)
    const q = searchQuery.toLowerCase()
    return (
      m.id.toLowerCase().includes(q) ||
      m.name.toLowerCase().includes(q) ||
      (m.description?.toLowerCase().includes(q))
    )
  })

  const sortedModels = [...filteredModels].sort((a, b) => {
    const aRec = recommendedModels.includes(a.id) ? 0 : 1
    const bRec = recommendedModels.includes(b.id) ? 0 : 1
    if (aRec !== bRec) return aRec - bRec
    return a.name.localeCompare(b.name)
  })

  const canShowAll = !searchQuery && displayModels.some((model) => !recommendedModels.includes(model.id))

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-xl font-semibold text-white/90">AI Models</h2>
        <p className="text-sm text-white/40 mt-1">
          Choose which {provider.label} model powers your AI assistant
        </p>
      </div>

      <div className="flex gap-2">
        {PROVIDERS.map((item) => (
          <button
            key={item.value}
            onClick={() => handleSelectProvider(item.value)}
            disabled={saving}
            className={`flex-1 px-3 py-2.5 rounded-xl text-sm transition-colors text-left ${
              aiProvider === item.value
                ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                : 'bg-white/5 text-white/40 border border-white/10 hover:border-white/20'
            }`}
          >
            <div className="font-medium">{item.label}</div>
            <div className="text-[10px] text-white/20 mt-0.5">{item.desc}</div>
          </button>
        ))}
      </div>

      {/* Current model */}
      <div className="px-4 py-3 rounded-xl bg-violet-500/10 border border-violet-500/20">
        <div className="flex items-center gap-2">
          <Check className="w-4 h-4 text-violet-400" />
          <span className="text-sm text-white/60">Active model:</span>
          <span className="text-sm text-violet-300 font-medium">{selectedModel}</span>
        </div>
      </div>

      {/* Search + Fetch */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search models..."
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5
                       text-sm text-white/90 placeholder-white/20 focus:border-violet-500/40
                       focus:outline-none transition-colors"
          />
        </div>
        {aiProvider === 'openrouter' && (
          <button
            onClick={fetchModels}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10
                       text-white/50 text-sm hover:bg-white/10 hover:text-white/70
                       disabled:opacity-30 transition-colors"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            {loading ? 'Loading...' : 'Fetch All'}
          </button>
        )}
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Model list */}
      <div className="space-y-2">
        {sortedModels.map((model) => {
          const isSelected = selectedModel === model.id
          const isRecommended = recommendedModels.includes(model.id)
          const isFree = aiProvider !== 'codex' && parseFloat(model.pricing.prompt) === 0 && parseFloat(model.pricing.completion) === 0

          return (
            <button
              key={model.id}
              onClick={() => handleSelectModel(model.id)}
              disabled={saving}
              className={`w-full text-left px-4 py-3 rounded-xl border transition-all duration-200 ${
                isSelected
                  ? 'bg-violet-500/15 border-violet-500/30 shadow-lg shadow-violet-500/5'
                  : 'bg-white/[0.02] border-white/5 hover:bg-white/5 hover:border-white/10'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium truncate ${
                      isSelected ? 'text-violet-300' : 'text-white/70'
                    }`}>
                      {model.name}
                    </span>
                    {isRecommended && (
                      <Star className="w-3 h-3 text-amber-400 shrink-0" />
                    )}
                    {isFree && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-400
                                       font-medium shrink-0">
                        FREE
                      </span>
                    )}
                    {isSelected && (
                      <Check className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-white/30 mt-0.5 font-mono truncate">{model.id}</p>
                  {model.description && (
                    <p className="text-xs text-white/20 mt-1 line-clamp-1">{model.description}</p>
                  )}
                </div>

                <div className="flex items-center gap-4 shrink-0 text-xs text-white/30">
                  <div className="flex items-center gap-1" title={aiProvider === 'codex' ? 'Uses Codex plan' : 'Input price per 1M tokens'}>
                    <DollarSign className="w-3 h-3" />
                    <span>{formatPrice(model.pricing.prompt, aiProvider)}</span>
                  </div>
                  <div className="flex items-center gap-1" title="Context length">
                    <Hash className="w-3 h-3" />
                    <span>{formatContextLength(model.context_length)}</span>
                  </div>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Show all toggle */}
      {canShowAll && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="flex items-center gap-2 text-sm text-white/30 hover:text-white/50 transition-colors"
        >
          {showAll ? (
            <>
              <ChevronUp className="w-4 h-4" />
              Show recommended only
            </>
          ) : (
            <>
              <ChevronDown className="w-4 h-4" />
              Show all {displayModels.length} models
            </>
          )}
        </button>
      )}

      {sortedModels.length === 0 && (
        <div className="text-center py-8">
          <Cpu className="w-8 h-8 text-white/10 mx-auto mb-3" />
          <p className="text-white/30 text-sm">
            {searchQuery ? 'No models match your search' : 'No models available'}
          </p>
        </div>
      )}
    </div>
  )
}
