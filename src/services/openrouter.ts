// OpenRouter API client — OpenAI-compatible with streaming support
import OpenAI from 'openai'
import { OPENROUTER_BASE_URL, OPENROUTER_REFERER, OPENROUTER_TITLE } from '../shared/constants'
import type { OpenRouterModel } from '../shared/types'

let client: OpenAI | null = null
let currentAbortController: AbortController | null = null

export function initClient(apiKey: string): OpenAI {
  client = new OpenAI({
    apiKey,
    baseURL: OPENROUTER_BASE_URL,
    defaultHeaders: {
      'HTTP-Referer': OPENROUTER_REFERER,
      'X-Title': OPENROUTER_TITLE
    }
  })
  return client
}

export function getClient(): OpenAI | null {
  return client
}

export interface StreamCallbacks {
  onChunk: (content: string) => void
  onDone: () => void
  onError: (error: string) => void
}

export async function streamCompletion(
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
  model: string,
  apiKey: string,
  callbacks: StreamCallbacks,
  maxTokens = 1500
): Promise<void> {
  const ai = initClient(apiKey)
  currentAbortController = new AbortController()

  try {
    const stream = await ai.chat.completions.create(
      {
        model,
        messages,
        max_tokens: maxTokens,
        stream: true
      },
      { signal: currentAbortController.signal }
    )

    for await (const chunk of stream) {
      const content = chunk.choices?.[0]?.delta?.content
      if (content) {
        callbacks.onChunk(content)
      }
    }
    callbacks.onDone()
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      callbacks.onDone()
      return
    }
    const message = err instanceof Error ? err.message : 'Unknown error occurred'
    callbacks.onError(message)
  } finally {
    currentAbortController = null
  }
}

export function cancelStream(): void {
  if (currentAbortController) {
    currentAbortController.abort()
    currentAbortController = null
  }
}

// Cache of fetched models for pricing lookups
let cachedModels: OpenRouterModel[] = []

export function getCachedModels(): OpenRouterModel[] {
  return cachedModels
}

export async function fetchAvailableModels(apiKey: string): Promise<OpenRouterModel[]> {
  try {
    const response = await fetch(`${OPENROUTER_BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    const models = (data.data || []).map((m: Record<string, unknown>) => ({
      id: m.id as string,
      name: (m.name as string) || (m.id as string),
      pricing: m.pricing as { prompt: string; completion: string },
      context_length: (m.context_length as number) || 4096,
      description: (m.description as string) || ''
    }))
    cachedModels = models
    return models
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch models'
    throw new Error(message)
  }
}

export async function validateApiKey(apiKey: string): Promise<boolean> {
  try {
    const models = await fetchAvailableModels(apiKey)
    return models.length > 0
  } catch {
    return false
  }
}

// Estimate cost based on token counts and model pricing
export function estimateCost(
  promptTokens: number,
  completionTokens: number,
  promptPrice: string,
  completionPrice: string
): number {
  const promptCost = promptTokens * parseFloat(promptPrice)
  const completionCost = completionTokens * parseFloat(completionPrice)
  return promptCost + completionCost
}
