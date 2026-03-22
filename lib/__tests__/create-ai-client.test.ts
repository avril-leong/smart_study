// lib/__tests__/create-ai-client.test.ts
// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { createAIClient } from '../ai/create-ai-client'

describe('createAIClient', () => {
  it('uses openai baseURL and default model for openai provider', () => {
    const { model } = createAIClient({ provider: 'openai', apiKey: 'sk-test', model: '' })
    expect(model).toBe('gpt-4o-mini')
  })

  it('uses deepseek baseURL and default model for deepseek provider', () => {
    const { model } = createAIClient({ provider: 'deepseek', apiKey: 'sk-test', model: '' })
    expect(model).toBe('deepseek-chat')
  })

  it('uses openrouter baseURL and default model for openrouter provider', () => {
    const { model } = createAIClient({ provider: 'openrouter', apiKey: 'sk-test', model: '' })
    expect(model).toBe('openai/gpt-4o-mini')
  })

  it('uses user-supplied model when provided', () => {
    const { model } = createAIClient({ provider: 'openai', apiKey: 'sk-test', model: 'gpt-4o' })
    expect(model).toBe('gpt-4o')
  })

  it('returns an OpenAI client instance', () => {
    const { client } = createAIClient({ provider: 'deepseek', apiKey: 'sk-test', model: '' })
    expect(client).toBeDefined()
    expect(typeof client.chat.completions.create).toBe('function')
  })
})
