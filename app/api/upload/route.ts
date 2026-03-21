import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { parseFile, SUPPORTED_TYPES } from '@/lib/parsers/index'

const MAX_SIZE = 50 * 1024 * 1024 // 50MB

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const name = formData.get('name') as string | null
  const subjectId = formData.get('subjectId') as string | null

  if (!file || !name) return NextResponse.json({ error: 'Missing file or name' }, { status: 400 })
  if (file.size > MAX_SIZE) return NextResponse.json({ error: 'File too large (max 50MB)' }, { status: 400 })
  if (!SUPPORTED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: `Unsupported file type: ${file.type}` }, { status: 400 })
  }

  let extractedText: string
  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    extractedText = await parseFile(buffer, file.type)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Parse error'
    return NextResponse.json({ error: message }, { status: 422 })
  }

  // Generate a study set ID upfront so we can name the storage file
  const studySetId = crypto.randomUUID()
  const storagePath = `${user.id}/${studySetId}.txt`

  const service = createServiceRoleClient()

  // Upload .txt sidecar
  const { error: storageError } = await service.storage
    .from('study-files')
    .upload(storagePath, Buffer.from(extractedText, 'utf-8'), { contentType: 'text/plain' })
  if (storageError) return NextResponse.json({ error: 'Storage upload failed' }, { status: 500 })

  // Insert study_set row
  const { error: dbError } = await service.from('study_sets').insert({
    id: studySetId,
    user_id: user.id,
    subject_id: subjectId || null,
    name,
    file_name: file.name,
    file_type: file.type,
    extracted_text_path: storagePath,
    generation_status: 'pending',
  })
  if (dbError) return NextResponse.json({ error: 'Database insert failed' }, { status: 500 })

  return NextResponse.json({ studySetId })
}
