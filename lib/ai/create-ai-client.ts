import OpenAI from 'openai'
import type { AIProvider } from '@/types'

const PROVIDER_MAP: Record<AIProvider, { baseURL: string; defaultModel: string }> = {
  openai:     { baseURL: 'https://api.openai.com/v1',     defaultModel: 'gpt-4o-mini' },
  deepseek:   { baseURL: 'https://api.deepseek.com',       defaultModel: 'deepseek-chat' },
  openrouter: { baseURL: 'https://openrouter.ai/api/v1',  defaultModel: 'openai/gpt-4o-mini' },
}

export function createAIClient(
  config: Pick<import('@/types').AIConfig, 'provider' | 'apiKey' | 'model'>
): { client: OpenAI; model: string } {
  const { baseURL, defaultModel } = PROVIDER_MAP[config.provider]
  const model = config.model.trim() || defaultModel
  const client = new OpenAI({ apiKey: config.apiKey, baseURL })
  return { client, model }
}
