// lib/ai/get-user-ai-config.ts
// Node.js only — uses lib/crypto.ts which requires node:crypto
import type { SupabaseClient } from '@supabase/supabase-js'
import { decryptKey } from '@/lib/crypto'
import { DEFAULT_BASE_PROMPT } from './constants'
import type { AIConfig, AIProvider } from '@/types'

const PROVIDER_DEFAULTS: Record<AIProvider, string> = {
  openai: 'gpt-4o-mini',
  deepseek: 'deepseek-chat',
  openrouter: 'openai/gpt-4o-mini',
}

/**
 * Resolves the AI config for a user.
 * Uses the service-role client so it can read user_ai_settings regardless of RLS.
 * Returns apiKey: '' if no BYOK key is configured — callers must check and return
 * a helpful error rather than attempting generation without a key.
 */
export async function getUserAIConfig(
  userId: string,
  serviceClient: SupabaseClient
): Promise<AIConfig> {
  const { data } = await serviceClient
    .from('user_ai_settings')
    .select('provider, model, encrypted_key, key_iv, global_custom_prompt, base_prompt')
    .eq('user_id', userId)
    .single()

  const provider = ((data?.provider) ?? 'deepseek') as AIProvider
  const model = data?.model?.trim() || PROVIDER_DEFAULTS[provider]
  const basePrompt = data?.base_prompt?.trim() || DEFAULT_BASE_PROMPT
  const globalCustomPrompt = data?.global_custom_prompt ?? null

  if (!data?.encrypted_key || !data?.key_iv) {
    return { provider, apiKey: '', model, basePrompt, globalCustomPrompt }
  }

  try {
    const apiKey = decryptKey(data.encrypted_key, data.key_iv)
    return { provider, apiKey, model, basePrompt, globalCustomPrompt }
  } catch (err) {
    console.warn('[getUserAIConfig] Decryption failed:', err)
    return { provider, apiKey: '', model, basePrompt, globalCustomPrompt }
  }
}
