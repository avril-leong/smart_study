import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { generateQuestions } from '@/lib/ai/generate-questions'

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { studySetId, mode = 'regenerate', documentIds } = await request.json()
  if (!studySetId) return NextResponse.json({ error: 'Missing studySetId' }, { status: 400 })

  // Validate append-mode requirement
  if (mode === 'append' && (!documentIds || documentIds.length === 0)) {
    return NextResponse.json({ error: 'documentIds required for append mode' }, { status: 400 })
  }

  const service = createServiceRoleClient()

  // Verify ownership
  const { data: studySet } = await service.from('study_sets')
    .select('id, user_id, generation_status')
    .eq('id', studySetId).single()

  if (!studySet || studySet.user_id !== user.id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Only short-circuit if already processing (prevent concurrent runs)
  if (studySet.generation_status === 'processing')
    return NextResponse.json({ ok: true, message: 'Already processing' })

  // Delete existing questions for regenerate mode
  if (mode === 'regenerate') {
    await service.from('questions').delete().eq('study_set_id', studySetId)
  }

  // Mark processing
  await service.from('study_sets').update({ generation_status: 'processing' }).eq('id', studySetId)

  try {
    // Fetch documents
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

    // Download and concatenate all document texts
    const texts: string[] = []
    for (const doc of docs) {
      const { data: fileData, error: dlError } = await service.storage
        .from('study-files').download(doc.extracted_text_path)
      if (dlError || !fileData) throw new Error(`Failed to download: ${doc.extracted_text_path}`)
      texts.push(await fileData.text())
    }
    const combinedText = texts.join('\n\n---\n\n')

    // Generate questions
    const questions = await generateQuestions(combinedText, studySetId)

    if (questions.length > 0) {
      const { error: insertError } = await service.from('questions').insert(questions)
      if (insertError) throw new Error('Failed to insert questions')
    }

    await service.from('study_sets').update({ generation_status: 'done' }).eq('id', studySetId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    await service.from('study_sets').update({ generation_status: 'error' }).eq('id', studySetId)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
