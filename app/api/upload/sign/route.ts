export const maxDuration = 10

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

const EXT_MAP: Record<string, string> = {
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/markdown': 'md',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
}

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest) {
  // 1. Verify auth
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { fileType, fileSize, studySetId, name, customPrompt } = body as {
    fileType?: string
    fileSize?: unknown
    studySetId?: string
    name?: string
    customPrompt?: string
  }

  // 2. Validate fileType
  const ext = fileType ? EXT_MAP[fileType] : undefined
  if (!ext) {
    return NextResponse.json({ error: `Unsupported file type: ${fileType}` }, { status: 400 })
  }

  // 3. Validate fileSize
  if (typeof fileSize !== 'number' || !Number.isInteger(fileSize) || fileSize <= 0 || fileSize > 52428800) {
    return NextResponse.json({ error: 'fileSize must be a positive integer ≤ 52428800 (50 MB)' }, { status: 400 })
  }

  const service = createServiceRoleClient()

  // 4 & 5. Validate studySetId (existing) or name (new)
  let resolvedStudySetId: string
  if (studySetId) {
    if (!UUID_V4_RE.test(studySetId)) {
      return NextResponse.json({ error: 'Invalid studySetId' }, { status: 400 })
    }
    const { data: existing } = await service.from('study_sets')
      .select('id, user_id')
      .eq('id', studySetId)
      .single()
    if (!existing || existing.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    resolvedStudySetId = studySetId
  } else {
    // New study set — validate name
    if (!name || typeof name !== 'string' || !name.trim() || name.trim().length > 200) {
      return NextResponse.json({ error: 'name is required and must be ≤ 200 chars for a new study set' }, { status: 400 })
    }
    resolvedStudySetId = crypto.randomUUID()
  }

  // 6. Validate customPrompt length (no sanitization here — we don't persist it)
  if (customPrompt !== undefined && customPrompt !== null) {
    if (typeof customPrompt !== 'string' || customPrompt.length > 500) {
      return NextResponse.json({ error: 'customPrompt must be ≤ 500 chars' }, { status: 400 })
    }
  }

  // 7. Generate IDs and path
  const documentId = crypto.randomUUID()
  const rawStoragePath = `${user.id}/${resolvedStudySetId}/raw/${documentId}.${ext}`

  // 8. Create signed upload URL (5-minute expiry)
  const { data: signData, error: signError } = await service.storage
    .from('study-files')
    .createSignedUploadUrl(rawStoragePath)

  if (signError || !signData) {
    console.error('Failed to create signed URL:', signError)
    return NextResponse.json({ error: 'Failed to create signed upload URL' }, { status: 500 })
  }

  return NextResponse.json({
    signedUrl: signData.signedUrl,
    token: signData.token,
    studySetId: resolvedStudySetId,
    documentId,
    rawStoragePath,
  })
}
