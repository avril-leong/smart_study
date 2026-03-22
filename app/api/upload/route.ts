export const maxDuration = 60 // PDF parsing can be slow for large files

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { parseFile, SUPPORTED_TYPES } from '@/lib/parsers/index'
import { sanitizePrompt } from '@/lib/sanitize'

const MAX_SIZE = 50 * 1024 * 1024

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const name = formData.get('name') as string | null
  const subjectId = formData.get('subjectId') as string | null
  const existingStudySetId = formData.get('studySetId') as string | null
  const rawCustomPrompt = formData.get('customPrompt') as string | null
  let customPromptSanitized: string | null = null
  if (rawCustomPrompt?.trim()) {
    try {
      customPromptSanitized = sanitizePrompt(rawCustomPrompt, 500)
    } catch {
      return NextResponse.json({ error: 'Prompt contains disallowed content' }, { status: 400 })
    }
  }

  if (!file) return NextResponse.json({ error: 'Missing file' }, { status: 400 })
  if (file.size > MAX_SIZE) return NextResponse.json({ error: 'File too large (max 50MB)' }, { status: 400 })
  if (!SUPPORTED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: `Unsupported file type: ${file.type}` }, { status: 400 })
  }

  // Extract text from file
  let extractedText: string
  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    extractedText = await parseFile(buffer, file.type)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Parse error'
    return NextResponse.json({ error: message }, { status: 422 })
  }

  const service = createServiceRoleClient()

  if (existingStudySetId) {
    // Attaching a new document to an existing study set
    const { data: existing } = await service.from('study_sets')
      .select('id, user_id')
      .eq('id', existingStudySetId)
      .single()
    if (!existing || existing.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const documentId = crypto.randomUUID()
    const storagePath = `${user.id}/${existingStudySetId}/${documentId}.txt`

    const { error: storageError } = await service.storage
      .from('study-files')
      .upload(storagePath, Buffer.from(extractedText, 'utf-8'), { contentType: 'text/plain' })
    if (storageError) return NextResponse.json({ error: 'Storage upload failed' }, { status: 500 })

    const { error: dbError } = await service.from('study_set_documents').insert({
      study_set_id: existingStudySetId,
      file_name: file.name,
      file_type: file.type,
      extracted_text_path: storagePath,
    })
    if (dbError) return NextResponse.json({ error: 'Database insert failed' }, { status: 500 })

    return NextResponse.json({ studySetId: existingStudySetId, documentId })
  }

  // Creating a new study set
  if (!name) return NextResponse.json({ error: 'Missing name' }, { status: 400 })

  const studySetId = crypto.randomUUID()
  const documentId = crypto.randomUUID()
  const storagePath = `${user.id}/${studySetId}/${documentId}.txt`

  const { error: storageError } = await service.storage
    .from('study-files')
    .upload(storagePath, Buffer.from(extractedText, 'utf-8'), { contentType: 'text/plain' })
  if (storageError) return NextResponse.json({ error: 'Storage upload failed' }, { status: 500 })

  const { error: setError } = await service.from('study_sets').insert({
    id: studySetId,
    user_id: user.id,
    subject_id: subjectId || null,
    name,
    file_name: null,
    file_type: null,
    extracted_text_path: null,
    generation_status: 'pending',
    custom_prompt: customPromptSanitized,
  })
  if (setError) return NextResponse.json({ error: 'Database insert failed' }, { status: 500 })

  const { error: docError } = await service.from('study_set_documents').insert({
    study_set_id: studySetId,
    file_name: file.name,
    file_type: file.type,
    extracted_text_path: storagePath,
  })
  if (docError) return NextResponse.json({ error: 'Database insert failed' }, { status: 500 })

  return NextResponse.json({ studySetId, documentId })
}
