// app/api/generate/route.ts
export const maxDuration = 300 // 5 minutes — Pro plan; free plan is capped at 60s

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { generateQuestions } from '@/lib/ai/generate-questions'
import type { QuestionType } from '@/types'
import { getUserAIConfig } from '@/lib/ai/get-user-ai-config'
import { sanitizePrompt } from '@/lib/sanitize'

type GenerationStyle = 'general' | 'exam_prep'

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { studySetId, mode = 'regenerate', documentIds, customPrompt: bodyCustomPrompt } = await request.json()
  if (!studySetId) return NextResponse.json({ error: 'Missing studySetId' }, { status: 400 })

  if (mode !== 'append' && mode !== 'regenerate') {
    return NextResponse.json({ error: 'mode must be "append" or "regenerate"' }, { status: 400 })
  }

  if (mode === 'append' && (!documentIds || documentIds.length === 0)) {
    return NextResponse.json({ error: 'documentIds required for append mode' }, { status: 400 })
  }

  const service = createServiceRoleClient()

  // Verify ownership — fetch all generation preferences
  const { data: studySet } = await service.from('study_sets')
    .select('id, user_id, generation_status, custom_prompt, question_count_pref, focus_lesson_content, question_types_pref, generation_style')
    .eq('id', studySetId).single()

  if (!studySet || studySet.user_id !== user.id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (studySet.generation_status === 'processing')
    return NextResponse.json({ ok: true, message: 'Already processing' })

  if (mode === 'regenerate') {
    await service.from('questions').delete().eq('study_set_id', studySetId)
  }

  await service.from('study_sets').update({ generation_status: 'processing' }).eq('id', studySetId)

  try {
    let docsQuery = service.from('study_set_documents')
      .select('extracted_text_path')
      .eq('study_set_id', studySetId)

    if (mode === 'append' && documentIds?.length > 0) {
      docsQuery = docsQuery.in('id', documentIds)
    }

    const { data: docs } = await docsQuery

    if (!docs || docs.length === 0) {
      throw new Error('No documents found for this study set')
    }

    const texts: string[] = []
    for (const doc of docs) {
      const { data: fileData, error: dlError } = await service.storage
        .from('study-files').download(doc.extracted_text_path)
      if (dlError || !fileData) throw new Error(`Failed to download: ${doc.extracted_text_path}`)
      texts.push(await fileData.text())
    }
    const combinedText = texts.join('\n\n---\n\n')

    // Resolve AI config (BYOK only)
    const aiConfig = await getUserAIConfig(user.id, service)
    if (!aiConfig.apiKey) {
      throw new Error('No API key configured. Add your API key in Settings → AI Settings.')
    }

    // Resolve effective custom prompt: body override > set-level > none
    const rawCustomPrompt = bodyCustomPrompt ?? studySet.custom_prompt ?? null
    const customPrompt = rawCustomPrompt ? sanitizePrompt(rawCustomPrompt, 500) : undefined

    const questionCount = (studySet as { question_count_pref?: number | null }).question_count_pref ?? 25
    const focusLessonContent = (studySet as { focus_lesson_content?: boolean | null }).focus_lesson_content ?? true
    const questionTypes = ((studySet as { question_types_pref?: string[] | null }).question_types_pref ?? ['mcq', 'short_answer']) as QuestionType[]
    const generationStyle = ((studySet as { generation_style?: string | null }).generation_style ?? 'general') as GenerationStyle
    const questions = await generateQuestions(combinedText, studySetId, aiConfig, customPrompt, questionCount, focusLessonContent, generationStyle, questionTypes)

    if (questions.length > 0) {
      const { error: insertError } = await service.from('questions').insert(questions)
      if (insertError) throw new Error('Failed to insert questions')
    }

    await service.from('study_sets').update({ generation_status: 'done' }).eq('id', studySetId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    await service.from('study_sets').update({ generation_status: 'error' }).eq('id', studySetId)
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[generate] failed for studySetId:', studySetId, '—', message, err)
    // 502 if AI provider rejected the key
    const isProviderRejection = message.toLowerCase().includes('401') || message.toLowerCase().includes('403')
    if (isProviderRejection) {
      return NextResponse.json(
        { error: 'AI provider rejected the API key. Check your key in Settings.' },
        { status: 502 }
      )
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
