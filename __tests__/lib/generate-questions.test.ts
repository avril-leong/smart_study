import { describe, it, expect } from 'vitest'
import { buildSystemPrompt } from '@/lib/ai/generate-questions'

describe('buildSystemPrompt', () => {
  it('returns base prompt without focus instruction when false', () => {
    const prompt = buildSystemPrompt(false)
    expect(prompt).toContain('You are a study assistant')
    expect(prompt).not.toContain('Focus exclusively on subject matter')
  })

  it('appends focus instruction when true', () => {
    const prompt = buildSystemPrompt(true)
    expect(prompt).toContain('You are a study assistant')
    expect(prompt).toContain('Focus exclusively on subject matter concepts')
    expect(prompt).toContain('Skip any content about: deadlines')
    expect(prompt).toContain('fewer questions rather than asking about irrelevant material')
  })

  it('focus instruction appears after base prompt', () => {
    const prompt = buildSystemPrompt(true)
    const baseIndex = prompt.indexOf('You are a study assistant')
    const focusIndex = prompt.indexOf('Focus exclusively')
    expect(focusIndex).toBeGreaterThan(baseIndex)
  })
})
