import { describe, it, expect } from 'vitest'
import { buildSystemPrompt, buildUserMessage, isQuestionLike, extractLastQuestion } from '../src/services/context-builder'

describe('interview grounding', () => {
  it('detects questions', () => {
    expect(isQuestionLike('Tell me about yourself?')).toBe(true)
    expect(isQuestionLike('Walk me through your experience at Stripe')).toBe(true)
    expect(isQuestionLike('yeah so yesterday we went')).toBe(false)
    expect(isQuestionLike('hi')).toBe(false)
  })
  it('extracts last question', () => {
    expect(extractLastQuestion('yeah okay. Tell me about a time you led a team?')).toContain('led a team')
    expect(extractLastQuestion('just noise um yeah')).toBeNull()
  })
  it('grounds system prompt in JD/CV', () => {
    const sys = buildSystemPrompt('base', { company: 'Stripe', role: 'Backend', jobDescription: 'Postgres', resumeText: 'Built payments', interviewMode: true })
    expect(sys).toContain('MY RESUME')
    expect(sys).toContain('JOB DESCRIPTION')
    expect(sys).toContain('Stripe')
  })
  it('orders JD before screen content, skips when off', () => {
    const on = buildUserMessage({ screenText: 'code', transcript: 'hi', userQuery: 'q', interviewCompany: 'Stripe', interviewRole: 'BE', jobDescription: 'JD', resumeText: 'CV', interviewMode: true })
    expect(on.indexOf('[JOB DESCRIPTION]')).toBeLessThan(on.indexOf('[SCREEN CONTENT]'))
    expect(on).toContain('[MY RESUME]')
    const off = buildUserMessage({ screenText: 'x', transcript: '', interviewMode: false })
    expect(off).not.toContain('[JOB DESCRIPTION]')
  })
})
