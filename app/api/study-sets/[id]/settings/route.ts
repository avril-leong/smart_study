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
  const { data: studySet } = await service.from('study_sets')
    .select('id, user_id').eq('id', params.id).single()
  if (!studySet || studySet.user_id !== user.id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const { name, subjectId, customPrompt, questionCountPref } = body

  const updates: Record<string, unknown> = {}

  if (name !== undefined) {
    if (!name || typeof name !== 'string' || !name.trim() || name.trim().length > 200)
      return NextResponse.json({ error: 'Name must be 1–200 chars' }, { status: 400 })
    updates.name = name.trim()
  }

  if ('subjectId' in body) {
    updates.subject_id = subjectId ?? null
  }

  if ('customPrompt' in body) {
    if (customPrompt && typeof customPrompt === 'string' && customPrompt.trim()) {
      if (customPrompt.length > 500)
        return NextResponse.json({ error: 'customPrompt must be ≤ 500 chars' }, { status: 400 })
      try {
        updates.custom_prompt = sanitizePrompt(customPrompt, 500)
      } catch (e) {
        if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 400 })
        throw e
      }
    } else {
      updates.custom_prompt = null
    }
  }

  if (questionCountPref !== undefined) {
    if (![10, 25, 50].includes(questionCountPref))
      return NextResponse.json({ error: 'questionCountPref must be 10, 25, or 50' }, { status: 400 })
    updates.question_count_pref = questionCountPref
  }

  if ('focusLessonContent' in body) {
    if (typeof body.focusLessonContent !== 'boolean')
      return NextResponse.json({ error: 'focusLessonContent must be a boolean' }, { status: 400 })
    updates.focus_lesson_content = body.focusLessonContent
  }

  if ('questionTypesPref' in body) {
    const allowed = new Set(['mcq', 'short_answer', 'multi_select'])
    const val = body.questionTypesPref
    if (!Array.isArray(val) || val.length === 0)
      return NextResponse.json({ error: 'questionTypesPref must be a non-empty array' }, { status: 400 })
    if (!val.every((v: unknown) => typeof v === 'string' && allowed.has(v)))
      return NextResponse.json({ error: 'questionTypesPref contains an invalid type' }, { status: 400 })
    updates.question_types_pref = val
  }

  if (Object.keys(updates).length === 0)
    return NextResponse.json({ ok: true })

  const { error } = await service.from('study_sets').update(updates).eq('id', params.id)
  if (error) return NextResponse.json({ error: 'Update failed' }, { status: 500 })

  return NextResponse.json({ ok: true })
}
