// Models page — select AI model and browse available models from OpenRouter
import { useState, useEffect, useCallback } from 'react'
import {
  Cpu, Search, Check, Zap, DollarSign, Hash,
  Loader2, RefreshCw, Star, ChevronDown, ChevronUp
} from 'lucide-react'

interface Model {
  id: string
  name: string
  pricing: { prompt: string; completion: string }
  context_length: number
  description?: string
}

const RECOMMENDED_MODELS = [
  'google/gemini-3-flash-preview',
  'anthropic/claude-sonnet-4',
  'deepseek/deepseek-chat',
  'meta-llama/llama-4-maverick',
  'meta-llama/llama-3.3-70b-instruct',
  'meta-llama/llama-3.1-8b-instruct',
  'upstage/solar-pro-3:free'
]

function formatPrice(price: string): string {
  const num = parseFloat(price)
  if (num === 0) return 'Free'
  if (num < 0.001) return `$${(num * 1000000).toFixed(2)}/M`
  return `$${(num * 1000000).toFixed(2)}/M`
}

function formatContextLength(len: number): string {
  if (len >= 1000000) return `${(len / 1000000).toFixed(1)}M`
  if (len >= 1000) return `${Math.round(len / 1000)}k`
  return `${len}`
}

export default function Models() {
  const [models, setModels] = useState<Model[]>([])
  const [selectedModel, setSelectedModel] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadCurrentModel()
  }, [])

  const loadCurrentModel = async () => {
    try {
      const model = await window.specterAPI.getSetting<string>('selectedModel')
      setSelectedModel(model || 'google/gemini-3-flash-preview')
    } catch (err) {
      console.error('Failed to load current model:', err)
    }
  }

  const fetchModels = useCallback(async () => {
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
  }, [])

  const handleSelectModel = useCallback(async (modelId: string) => {
    setSaving(true)
    try {
      await window.specterAPI.setSetting('selectedModel', modelId)
      setSelectedModel(modelId)
    } catch (err) {
      console.error('Failed to save model:', err)
    } finally {
      setSaving(false)
    }
  }, [])

  // Default models shown before fetching
  const defaultModels: Model[] = [
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

  const displayModels = models.length > 0 ? models : defaultModels

  const filteredModels = displayModels.filter((m) => {
    if (!searchQuery) return showAll || RECOMMENDED_MODELS.includes(m.id)
    const q = searchQuery.toLowerCase()
    return (
      m.id.toLowerCase().includes(q) ||
      m.name.toLowerCase().includes(q) ||
      (m.description?.toLowerCase().includes(q))
    )
  })

  // Sort: recommended first, then by name
  const sortedModels = [...filteredModels].sort((a, b) => {
    const aRec = RECOMMENDED_MODELS.includes(a.id) ? 0 : 1
    const bRec = RECOMMENDED_MODELS.includes(b.id) ? 0 : 1
    if (aRec !== bRec) return aRec - bRec
    return a.name.localeCompare(b.name)
  })

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-xl font-semibold text-white/90">AI Models</h2>
        <p className="text-sm text-white/40 mt-1">
          Choose which OpenRouter model powers your AI assistant
        </p>
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
          const isRecommended = RECOMMENDED_MODELS.includes(model.id)
          const isFree = parseFloat(model.pricing.prompt) === 0 && parseFloat(model.pricing.completion) === 0

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
                  <div className="flex items-center gap-1" title="Input price per 1M tokens">
                    <DollarSign className="w-3 h-3" />
                    <span>{formatPrice(model.pricing.prompt)}</span>
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
      {models.length > 0 && !searchQuery && (
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
              Show all {models.length} models
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
