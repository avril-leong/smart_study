import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { generateQuestions } from '@/lib/ai/generate-questions'

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { studySetId } = await request.json()
  if (!studySetId) return NextResponse.json({ error: 'Missing studySetId' }, { status: 400 })

  const service = createServiceRoleClient()

  // Verify ownership
  const { data: studySet } = await service.from('study_sets')
    .select('id, user_id, extracted_text_path, generation_status')
    .eq('id', studySetId).single()

  if (!studySet || studySet.user_id !== user.id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (studySet.generation_status === 'done')
    return NextResponse.json({ ok: true, message: 'Already generated' })

  // Mark processing
  await service.from('study_sets').update({ generation_status: 'processing' }).eq('id', studySetId)

  try {
    // Download .txt sidecar
    const { data: fileData, error: dlError } = await service.storage
      .from('study-files').download(studySet.extracted_text_path)
    if (dlError || !fileData) throw new Error('Failed to download text sidecar')

    const text = await fileData.text()

    // Generate questions
    const questions = await generateQuestions(text, studySetId)

    // Bulk insert
    if (questions.length > 0) {
      const { error: insertError } = await service.from('questions').insert(questions)
      if (insertError) throw new Error('Failed to insert questions')
    }

    await service.from('study_sets').update({ generation_status: 'done' }).eq('id', studySetId)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    await service.from('study_sets').update({ generation_status: 'error' }).eq('id', studySetId)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
