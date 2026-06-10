// OpenAI API client — uses OpenAI Platform API credits.
import { OPENAI_API_BASE_URL } from '../shared/constants'

let currentAbortController: AbortController | null = null

export interface OpenAIStreamCallbacks {
  onChunk: (content: string) => void
  onDone: () => void
  onError: (error: string) => void
}

function buildInput(messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>): string {
  const system = messages.find((m) => m.role === 'system')?.content || ''
  const conversation = messages
    .filter((m) => m.role !== 'system')
    .map((m) => `${m.role.toUpperCase()}:\n${m.content}`)
    .join('\n\n')

  return [
    system ? `SYSTEM:\n${system}` : '',
    conversation,
    'Return only the assistant response.'
  ].filter(Boolean).join('\n\n')
}

function extractError(data: unknown): string {
  if (typeof data === 'object' && data !== null) {
    const record = data as Record<string, unknown>
    const error = record.error as Record<string, unknown> | undefined
    if (typeof error?.message === 'string') return error.message
    if (typeof record.message === 'string') return record.message
  }
  return 'OpenAI API request failed.'
}

function handleEvent(eventType: string, data: unknown, callbacks: OpenAIStreamCallbacks): boolean {
  if (typeof data !== 'object' || data === null) return false
  const record = data as Record<string, unknown>

  if (eventType === 'response.output_text.delta' && typeof record.delta === 'string') {
    callbacks.onChunk(record.delta)
  }

  if (eventType === 'response.completed') {
    callbacks.onDone()
    return true
  }

  if (eventType === 'response.failed' || eventType === 'error') {
    callbacks.onError(extractError(record))
    return true
  }

  return false
}

function processSseBlock(block: string, callbacks: OpenAIStreamCallbacks): boolean {
  let eventType = ''
  const dataLines: string[] = []

  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith('event:')) {
      eventType = line.slice(6).trim()
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart())
    }
  }

  const rawData = dataLines.join('\n')
  if (!rawData || rawData === '[DONE]') return rawData === '[DONE]'

  try {
    return handleEvent(eventType, JSON.parse(rawData), callbacks)
  } catch {
    return false
  }
}

export async function streamOpenAICompletion(
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
  model: string,
  apiKey: string,
  callbacks: OpenAIStreamCallbacks,
  maxOutputTokens = 1500
): Promise<void> {
  currentAbortController = new AbortController()
  let finished = false

  try {
    const response = await fetch(`${OPENAI_API_BASE_URL}/responses`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        input: buildInput(messages),
        max_output_tokens: maxOutputTokens,
        stream: true
      }),
      signal: currentAbortController.signal
    })

    if (!response.ok) {
      let message = `${response.status} ${response.statusText}`
      try {
        const data = await response.json()
        message = extractError(data)
      } catch {
        // Keep HTTP status as the error message.
      }
      callbacks.onError(message)
      return
    }

    if (!response.body) {
      callbacks.onError('OpenAI API returned an empty response.')
      return
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { value, done } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const blocks = buffer.split(/\r?\n\r?\n/)
      buffer = blocks.pop() || ''

      for (const block of blocks) {
        if (processSseBlock(block, callbacks)) {
          finished = true
        }
      }
    }

    if (buffer.trim()) {
      finished = processSseBlock(buffer, callbacks) || finished
    }

    if (!finished) {
      callbacks.onDone()
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      callbacks.onDone()
      return
    }
    const message = err instanceof Error ? err.message : 'Unknown OpenAI API error'
    callbacks.onError(message)
  } finally {
    currentAbortController = null
  }
}

export function cancelOpenAIStream(): void {
  if (currentAbortController) {
    currentAbortController.abort()
    currentAbortController = null
  }
}
