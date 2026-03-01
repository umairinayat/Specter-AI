// Context builder — combines screen OCR + audio transcript + user query into prompts
import { DEFAULT_SYSTEM_PROMPT } from '../shared/constants'
import type { ContextSnapshot } from '../shared/types'

export function buildSystemPrompt(customPrompt?: string): string {
  return customPrompt || DEFAULT_SYSTEM_PROMPT
}

export function buildUserMessage(ctx: ContextSnapshot): string {
  const parts: string[] = []

  if (ctx.screenText) {
    parts.push(`[SCREEN CONTENT]\n${ctx.screenText.slice(0, 3000)}`)
  }

  if (ctx.transcript) {
    parts.push(`[RECENT CONVERSATION TRANSCRIPT]\n${ctx.transcript.slice(0, 2000)}`)
  }

  if (ctx.userQuery) {
    parts.push(`[MY QUESTION]\n${ctx.userQuery}`)
  } else {
    parts.push(`[TASK]\nBased on the screen and conversation above, what should I say or do next?`)
  }

  return parts.join('\n\n')
}

// Rough token estimate (1 token ≈ 4 chars for English)
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}
