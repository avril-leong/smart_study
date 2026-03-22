import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { sanitizePrompt, ValidationError } from '@/lib/sanitize'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceRoleClient()

  // Verify ownership
  const { data: studySet } = await service
    .from('study_sets')
    .select('id, user_id')
    .eq('id', params.id)
    .single()

  if (!studySet || studySet.user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { customPrompt } = await request.json()

  let sanitized: string | null = null
  if (customPrompt && typeof customPrompt === 'string' && customPrompt.trim()) {
    try {
      sanitized = sanitizePrompt(customPrompt, 500)
    } catch (err) {
      if (err instanceof ValidationError) {
        return NextResponse.json({ error: 'Prompt contains disallowed content' }, { status: 400 })
      }
      throw err
    }
  }

  const { error } = await service
    .from('study_sets')
    .update({ custom_prompt: sanitized })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: 'Failed to update prompt' }, { status: 500 })

  return NextResponse.json({ ok: true })
}
