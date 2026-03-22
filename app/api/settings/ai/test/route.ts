import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAIClient } from '@/lib/ai/create-ai-client'
import type { AIProvider } from '@/types'

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { provider, model, apiKey } = await request.json()
  if (!apiKey || typeof apiKey !== 'string') {
    return NextResponse.json({ error: 'Missing apiKey' }, { status: 400 })
  }

  const { client, model: resolvedModel } = createAIClient({
    provider: provider as AIProvider,
    apiKey,
    model: model ?? '',
  })

  try {
    await client.chat.completions.create({
      model: resolvedModel,
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 1,
    })
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const status = (err as { status?: number }).status
    if (status === 401 || status === 403) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 400 })
    }
    return NextResponse.json({ error: 'Provider error' }, { status: 400 })
  }
}
