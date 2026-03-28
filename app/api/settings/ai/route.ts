// app/api/settings/ai/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { encryptKey } from '@/lib/crypto'
import type { AIProvider } from '@/types'

const VALID_PROVIDERS: AIProvider[] = ['openai', 'deepseek', 'openrouter']

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceRoleClient()
  const { data } = await service
    .from('user_ai_settings')
    .select('provider, model, encrypted_key')
    .eq('user_id', user.id)
    .single()

  return NextResponse.json({
    provider: data?.provider ?? 'deepseek',
    model: data?.model ?? '',
    hasKey: !!data?.encrypted_key,
  })
}

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { provider, model, apiKey } = body

  if (!VALID_PROVIDERS.includes(provider)) {
    return NextResponse.json({ error: 'Invalid provider' }, { status: 400 })
  }

  const service = createServiceRoleClient()

  const row: Record<string, unknown> = {
    user_id: user.id,
    provider,
    model: model ?? '',
    updated_at: new Date().toISOString(),
  }

  // Only encrypt and store key if a new one was provided
  if (apiKey && typeof apiKey === 'string' && apiKey.trim()) {
    const { encrypted, iv } = encryptKey(apiKey.trim())
    row.encrypted_key = encrypted
    row.key_iv = iv
  }

  const { error } = await service
    .from('user_ai_settings')
    .upsert(row, { onConflict: 'user_id' })

  if (error) return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 })

  return NextResponse.json({ ok: true })
}
