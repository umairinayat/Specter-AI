// Context builder — combines screen OCR + audio transcript + user query into prompts
// Extended with interview grounding: job description + resume (Parakeet-style)
import { DEFAULT_SYSTEM_PROMPT } from '../shared/constants'
import type { ContextSnapshot } from '../shared/types'

// Truncation budgets — keep JD/resume prominent but bounded
const MAX_JD_CHARS = 4000
const MAX_RESUME_CHARS = 4000

export interface InterviewProfile {
  company?: string
  role?: string
  jobDescription?: string
  resumeText?: string
  interviewMode?: boolean
}

export function buildSystemPrompt(customPrompt?: string, interview?: InterviewProfile): string {
  const base = customPrompt || DEFAULT_SYSTEM_PROMPT

  if (!interview?.interviewMode) return base
  if (!interview.jobDescription && !interview.resumeText && !interview.company && !interview.role) {
    return base
  }

  const lines: string[] = []
  if (interview.role || interview.company) {
    const target = [interview.role, interview.company].filter(Boolean).join(' at ')
    lines.push(`You are helping the user interview for: ${target}.`)
  }
  lines.push('Answer as the candidate, in first person, ready to say out loud.')
  if (interview.resumeText) {
    lines.push('Ground every answer in [MY RESUME] — use ONLY real experience, companies, dates, and skills from there. Never invent jobs, dates, or technologies not listed.')
  }
  if (interview.jobDescription) {
    lines.push('Mirror the language and priorities of [JOB DESCRIPTION] — reuse its keywords and required skills where truthful.')
  }
  lines.push(
    'Rules:',
    '- Answer the LAST question only. Be direct and concise.',
    '- Behavioral questions: 2-3 sentence STAR answer (Situation, Task, Action, Result) drawn from the resume.',
    '- Technical questions: 2-4 sentences, then tie back to resume experience in one clause.',
    '- Coding questions: complete solution code first, then exactly 2 lines of explanation.',
    '- Multiple-choice: return only the correct letter/option.',
    '- If the question is garbled or no question is present, respond with exactly: "No question detected."',
    '- Never reveal you are an AI assistant unless directly asked.'
  )

  return `${lines.join('\n')}\n\n${base}`
}

export function buildUserMessage(ctx: ContextSnapshot): string {
  const parts: string[] = []

  // Interview grounding goes FIRST so the model prioritises it
  if (ctx.interviewMode && (ctx.jobDescription || ctx.resumeText || ctx.interviewCompany || ctx.interviewRole)) {
    if (ctx.interviewCompany || ctx.interviewRole) {
      const target = [ctx.interviewRole, ctx.interviewCompany].filter(Boolean).join(' at ')
      parts.push(`[TARGET ROLE]\n${target}`)
    }
    if (ctx.jobDescription) {
      parts.push(`[JOB DESCRIPTION]\n${ctx.jobDescription.slice(0, MAX_JD_CHARS)}`)
    }
    if (ctx.resumeText) {
      parts.push(`[MY RESUME]\n${ctx.resumeText.slice(0, MAX_RESUME_CHARS)}`)
    }
  }

  if (ctx.screenText) {
    parts.push(`[SCREEN CONTENT]\n${ctx.screenText.slice(0, 3000)}`)
  }

  if (ctx.screenshot) {
    parts.push('[SCREEN IMAGE]\nA screenshot of the current screen is attached. Treat it as the primary view of what the user is looking at.')
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

/**
 * Heuristic: does this text look like an interview question?
 * Used for auto-answer — triggers on questions heard via voice.
 */
export function isQuestionLike(text: string): boolean {
  if (!text) return false
  const t = text.trim()
  if (t.length < 12) return false
  if (t.includes('?')) return true
  return /^(tell me|walk me|describe|explain|how|what|why|when|where|which|who|can you|could you|would you|have you|do you|are you|give me|talk about|take me through)\b/i.test(t)
}

/**
 * Extract the last question-like sentence from a transcript chunk.
 * Returns null when nothing question-like is found.
 */
export function extractLastQuestion(transcript: string): string | null {
  if (!transcript) return null
  // Split on sentence boundaries, walk backwards
  const sentences = transcript
    .split(/(?<=[.?!])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
  for (let i = sentences.length - 1; i >= 0; i--) {
    const s = sentences[i]
    if (isQuestionLike(s)) return s.slice(0, 1000)
  }
  // Fallback: whole tail if the tail itself looks like a question
  const tail = sentences.slice(-2).join(' ').slice(0, 1000)
  return isQuestionLike(tail) ? tail : null
}

// Rough token estimate (1 token ≈ 4 chars for English)
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}
