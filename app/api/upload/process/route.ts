export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { parseFile } from '@/lib/parsers/index'
import { sanitizePrompt, ValidationError } from '@/lib/sanitize'

const MIME_FROM_EXT: Record<string, string> = {
  'pdf': 'application/pdf',
  'txt': 'text/plain',
  'md': 'text/markdown',
  'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}

const UUID_V4 = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
// Anchored full-path regex: userId/studySetId/raw/documentId.ext
const PATH_RE = new RegExp(
  `^(${UUID_V4})/(${UUID_V4})/raw/(${UUID_V4})\\.(pdf|txt|md|docx|pptx)$`
)
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

async function tryDeleteStorage(service: ReturnType<typeof createServiceRoleClient>, paths: string[]) {
  try {
    await service.storage.from('study-files').remove(paths)
  } catch (e) {
    console.error('Cleanup failed for paths:', paths, e)
  }
}

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

  const {
    rawStoragePath,
    fileName,
    fileType: clientFileType,
    studySetId,
    documentId,
    isNewStudySet,
    name: rawName,
    subjectId,
    customPrompt: rawCustomPrompt,
    questionTypesPref: rawQuestionTypesPref,
    generationStyle: rawGenerationStyle,
  } = body as {
    rawStoragePath?: string
    fileName?: string
    fileType?: string
    studySetId?: string
    documentId?: string
    isNewStudySet?: boolean
    name?: string
    subjectId?: string | null
    customPrompt?: string | null
    questionTypesPref?: string[]
    generationStyle?: string
  }

  if (!rawStoragePath || typeof rawStoragePath !== 'string') {
    return NextResponse.json({ error: 'rawStoragePath is required' }, { status: 400 })
  }

  // 2. Ownership check: first segment must equal userId (strict equality)
  const segments = rawStoragePath.split('/')
  if (segments[0] !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // 3. Full path validation via anchored regex
  const pathMatch = PATH_RE.exec(rawStoragePath)
  if (!pathMatch) {
    return NextResponse.json({ error: 'Invalid rawStoragePath format' }, { status: 400 })
  }
  // pathMatch[1] = userId, pathMatch[2] = studySetId, pathMatch[3] = documentId, pathMatch[4] = ext

  // 4. Cross-check body fields match path segments
  const pathStudySetId = pathMatch[2]
  const pathDocumentId = pathMatch[3]
  const pathExt = pathMatch[4]

  if (studySetId !== pathStudySetId) {
    return NextResponse.json({ error: 'studySetId does not match rawStoragePath' }, { status: 400 })
  }
  // documentId in path is segments[3].split('.')[0] which equals pathDocumentId
  if (documentId !== pathDocumentId) {
    return NextResponse.json({ error: 'documentId does not match rawStoragePath' }, { status: 400 })
  }

  // 5. Derive fileType from path extension (ignore client-supplied value for parsing)
  const derivedFileType = MIME_FROM_EXT[pathExt]
  if (!derivedFileType) {
    return NextResponse.json({ error: 'Unrecognised file extension in path' }, { status: 400 })
  }
  if (clientFileType && clientFileType !== derivedFileType) {
    return NextResponse.json({ error: 'fileType does not match rawStoragePath extension' }, { status: 400 })
  }

  // 6. Validate and sanitize fileName
  if (!fileName || typeof fileName !== 'string' || !fileName.trim() || fileName.trim().length > 255) {
    return NextResponse.json({ error: 'fileName is required and must be ≤ 255 chars' }, { status: 400 })
  }
  const sanitizedFileName = fileName.trim()

  // 7. Validate subjectId if provided
  const normalizedSubjectId = subjectId || null
  if (normalizedSubjectId != null && !UUID_V4_RE.test(normalizedSubjectId)) {
    return NextResponse.json({ error: 'Invalid subjectId' }, { status: 400 })
  }

  // 8a. Validate generationStyle — required for new study sets
  const VALID_GENERATION_STYLES = new Set(['general', 'exam_prep'])
  let validatedGenerationStyle: 'general' | 'exam_prep' = 'general'
  if (isNewStudySet) {
    if (!rawGenerationStyle || !VALID_GENERATION_STYLES.has(rawGenerationStyle)) {
      return NextResponse.json({ error: 'generationStyle must be "general" or "exam_prep"' }, { status: 400 })
    }
    validatedGenerationStyle = rawGenerationStyle as 'general' | 'exam_prep'
  }

  // 8b. Validate questionTypesPref if provided
  const ALLOWED_QUESTION_TYPES = new Set(['mcq', 'short_answer', 'multi_select'])
  let validatedQuestionTypesPref: string[] | null = null
  if (rawQuestionTypesPref !== undefined && rawQuestionTypesPref !== null) {
    if (!Array.isArray(rawQuestionTypesPref) || rawQuestionTypesPref.length === 0) {
      return NextResponse.json({ error: 'questionTypesPref must be a non-empty array' }, { status: 400 })
    }
    if (!rawQuestionTypesPref.every((v: unknown) => typeof v === 'string' && ALLOWED_QUESTION_TYPES.has(v))) {
      return NextResponse.json({ error: 'questionTypesPref contains an invalid type' }, { status: 400 })
    }
    validatedQuestionTypesPref = rawQuestionTypesPref as string[]
  }

  // 8. Sanitize customPrompt if provided
  let sanitizedCustomPrompt: string | null = null
  if (rawCustomPrompt && typeof rawCustomPrompt === 'string' && rawCustomPrompt.trim()) {
    if (rawCustomPrompt.length > 500) {
      return NextResponse.json({ error: 'customPrompt must be ≤ 500 chars' }, { status: 400 })
    }
    try {
      sanitizedCustomPrompt = sanitizePrompt(rawCustomPrompt, 500)
    } catch (e) {
      if (e instanceof ValidationError) {
        return NextResponse.json({ error: e.message }, { status: 400 })
      }
      throw e
    }
  }

  const service = createServiceRoleClient()

  // 9 & 10. isNewStudySet is advisory — DB is authoritative
  let sanitizedName: string | undefined
  if (isNewStudySet) {
    if (!rawName || typeof rawName !== 'string' || !rawName.trim() || rawName.trim().length > 200) {
      return NextResponse.json({ error: 'name is required and must be ≤ 200 chars for a new study set' }, { status: 400 })
    }
    sanitizedName = rawName.trim()

    // Check no existing row (pre-check for clean 409 — insert is the atomic gate)
    const { data: existingSet } = await service.from('study_sets')
      .select('id').eq('id', studySetId!).maybeSingle()
    if (existingSet) {
      return NextResponse.json({ error: 'Study set already exists' }, { status: 409 })
    }
  } else {
    // Verify caller owns the existing study set
    const { data: existingSet } = await service.from('study_sets')
      .select('id, user_id').eq('id', studySetId!).single()
    if (!existingSet || existingSet.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  // 11. Download raw file
  const { data: fileData, error: downloadError } = await service.storage
    .from('study-files').download(rawStoragePath)

  if (downloadError) {
    // Supabase storage 404 surfaces as an error with a specific message
    const is404 = downloadError.message?.toLowerCase().includes('not found') ||
      downloadError.message?.toLowerCase().includes('404') ||
      (downloadError as unknown as { statusCode?: string | number }).statusCode === 404
    if (is404) {
      return NextResponse.json(
        { error: 'Uploaded file not found — the signed URL may have expired or the upload did not complete' },
        { status: 404 }
      )
    }
    console.error('Download error:', downloadError)
    return NextResponse.json({ error: 'Failed to download uploaded file' }, { status: 500 })
  }

  const buffer = Buffer.from(await fileData.arrayBuffer())

  // 12. Parse file
  let extractedText: string
  try {
    extractedText = await parseFile(buffer, derivedFileType)
  } catch (err) {
    await tryDeleteStorage(service, [rawStoragePath])
    const message = err instanceof Error ? err.message : 'Failed to extract text from file'
    return NextResponse.json({ error: message }, { status: 422 })
  }

  // 13. Build text storage path and upload
  const textStoragePath = `${user.id}/${studySetId}/${documentId}.txt`
  const { error: textUploadError } = await service.storage
    .from('study-files')
    .upload(textStoragePath, Buffer.from(extractedText, 'utf-8'), { contentType: 'text/plain' })

  if (textUploadError) {
    await tryDeleteStorage(service, [rawStoragePath])
    console.error('Text upload error:', textUploadError)
    return NextResponse.json({ error: 'Failed to save extracted text' }, { status: 500 })
  }

  // 14. Insert study_sets row if new
  if (isNewStudySet) {
    const { error: setError } = await service.from('study_sets').insert({
      id: studySetId,
      user_id: user.id,
      name: sanitizedName,
      subject_id: normalizedSubjectId,
      custom_prompt: sanitizedCustomPrompt,
      generation_status: 'pending',
      generation_style: validatedGenerationStyle,
      file_name: null,
      file_type: null,
      extracted_text_path: null,
      ...(validatedQuestionTypesPref ? { question_types_pref: validatedQuestionTypesPref } : {}),
    })
    if (setError) {
      if (setError.code === '23505') {
        // Concurrent request already created the row — clean up this request's orphaned files
        await tryDeleteStorage(service, [rawStoragePath, textStoragePath])
        return NextResponse.json({ error: 'Study set already exists (concurrent request)' }, { status: 409 })
      }
      await tryDeleteStorage(service, [rawStoragePath, textStoragePath])
      console.error('study_sets insert error:', setError)
      return NextResponse.json({ error: 'Database insert failed' }, { status: 500 })
    }
  }

  // 15. Insert study_set_documents row
  const { error: docError } = await service.from('study_set_documents').insert({
    id: documentId,
    study_set_id: studySetId,
    file_name: sanitizedFileName,
    file_type: derivedFileType,
    extracted_text_path: textStoragePath,
  })

  if (docError) {
    if (docError.code === '23505') {
      // Duplicate documentId — idempotent retry. Verify ownership with a single JOIN.
      const { data: existing } = await service
        .from('study_set_documents')
        .select('id, study_sets!inner(id, user_id)')
        .eq('id', documentId!)
        .eq('study_set_id', studySetId!)
        .single()

      const ownerUserId = (existing?.study_sets as unknown as { user_id: string } | null)?.user_id
      if (ownerUserId === user.id) {
        // Idempotent success — clean up raw file best-effort and return 200
        await tryDeleteStorage(service, [rawStoragePath])
        return NextResponse.json({ studySetId, documentId })
      }
      return NextResponse.json({ error: 'Conflict' }, { status: 409 })
    }

    // Non-duplicate failure — roll back
    const cleanupPaths = [rawStoragePath, textStoragePath]
    await tryDeleteStorage(service, cleanupPaths)
    if (isNewStudySet) {
      await service.from('study_sets').delete().eq('id', studySetId!)
    }
    console.error('study_set_documents insert error:', docError)
    return NextResponse.json({ error: 'Database insert failed' }, { status: 500 })
  }

  // 16. Best-effort cleanup of raw file
  await tryDeleteStorage(service, [rawStoragePath])

  return NextResponse.json({ studySetId, documentId })
}
