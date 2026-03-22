# Presigned Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-step `/api/upload` route with a 3-step presigned URL flow (sign → direct browser upload → process) so files of any size bypass Vercel's 4.5 MB payload limit.

**Architecture:** The client calls `/api/upload/sign` to get a Supabase presigned URL, then PUTs the file directly to Supabase Storage from the browser (no Vercel involvement), then calls `/api/upload/process` which downloads the raw file, parses it, stores the text, and writes the DB records. The old `/api/upload` route is replaced with a 410 Gone response.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (Storage + Postgres), Vitest

---

## Spec reference

`docs/superpowers/specs/2026-03-22-presigned-upload-design.md`

## File structure

| File | Action | Responsibility |
|------|--------|----------------|
| `app/api/upload/route.ts` | Modify | Return 410 Gone |
| `app/api/upload/sign/route.ts` | Create | Auth check, validation, presigned URL generation |
| `app/api/upload/process/route.ts` | Create | Auth check, validation, parse, store text, write DB |
| `app/upload/page.tsx` | Modify | Replace FormData upload with 3-step flow |
| `components/dashboard/AddDocumentModal.tsx` | Modify | Replace FormData upload with 3-step flow |

## Constants shared across both new routes

Both routes need the same extension map. Define it at the top of each new route file (not extracted to a lib file — YAGNI):

```typescript
// Extension map — must match lib/parsers/index.ts SUPPORTED_TYPES
const EXT_MAP: Record<string, string> = {
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/markdown': 'md',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
}

// Reverse map for /process (derive fileType from extension)
const MIME_FROM_EXT: Record<string, string> = Object.fromEntries(
  Object.entries(EXT_MAP).map(([mime, ext]) => [ext, mime])
)

const UUID_V4 = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
const PATH_REGEX = new RegExp(`^(${UUID_V4})/(${UUID_V4})/raw/(${UUID_V4})\\.(pdf|txt|md|docx|pptx)$`)
```

---

## Task 1: Deprecate old upload route

**Files:**
- Modify: `app/api/upload/route.ts`

- [ ] **Step 1: Replace the route body**

Open `app/api/upload/route.ts`. Replace the entire file content with:

```typescript
import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    { error: 'This endpoint has been replaced. Use /api/upload/sign and /api/upload/process.' },
    { status: 410 }
  )
}
```

- [ ] **Step 2: Verify it builds**

```bash
cd "C:\SIT\Personal\smart_study"
npx tsc --noEmit
```

Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/upload/route.ts
git commit -m "feat: deprecate old upload route with 410 Gone"
```

---

## Task 2: Create `/api/upload/sign/route.ts`

**Files:**
- Create: `app/api/upload/sign/route.ts`

- [ ] **Step 1: Create the sign route**

Create the file `app/api/upload/sign/route.ts` with this content:

```typescript
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
    .createSignedUploadUrl(rawStoragePath, { expiresIn: 300 })

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
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/upload/sign/route.ts
git commit -m "feat: add /api/upload/sign endpoint for presigned uploads"
```

---

## Task 3: Create `/api/upload/process/route.ts`

**Files:**
- Create: `app/api/upload/process/route.ts`

- [ ] **Step 1: Create the process route**

Create the file `app/api/upload/process/route.ts` with this content:

```typescript
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
  if (subjectId != null && subjectId !== '' && !UUID_V4_RE.test(subjectId)) {
    return NextResponse.json({ error: 'Invalid subjectId' }, { status: 400 })
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
      subject_id: subjectId || null,
      custom_prompt: sanitizedCustomPrompt,
      generation_status: 'pending',
      file_name: null,
      file_type: null,
      extracted_text_path: null,
    })
    if (setError) {
      // Check unique constraint BEFORE cleanup — the concurrent request that won may need the text file
      if (setError.code === '23505') {
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

      const ownerUserId = (existing?.study_sets as { user_id: string } | null)?.user_id
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
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run existing tests to confirm nothing broken**

```bash
npx vitest run
```

Expected: all tests pass (these are unit tests for lib utilities, not API routes).

- [ ] **Step 4: Commit**

```bash
git add app/api/upload/process/route.ts
git commit -m "feat: add /api/upload/process endpoint"
```

---

## Task 4: Update upload page to 3-step flow

**Files:**
- Modify: `app/upload/page.tsx` (lines 60–131 — the `handleSubmit` function)

- [ ] **Step 1: Replace `handleSubmit` in `app/upload/page.tsx`**

Find the existing `handleSubmit` function (starts around line 60, ends around line 131). Replace it entirely with:

```typescript
async function handleSubmit(e: React.FormEvent) {
  e.preventDefault()
  if (files.length === 0) return
  if (!hasKey) {
    setError('No API key configured. Go to Settings → AI Settings to add your key before generating questions.')
    return
  }
  setError('')
  setStage('uploading')

  let studySetId: string | null = null

  // Upload first file — creates the study set
  const file0 = files[0]

  // Step A: sign
  const signRes0 = await window.fetch('/api/upload/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileType: file0.type,
      fileSize: file0.size,
      name,
      subjectId: subjectId || undefined,
      customPrompt: customPrompt.trim() || undefined,
    }),
  })
  if (!signRes0.ok) {
    const text = await signRes0.text()
    let msg = 'Upload failed'
    try { msg = JSON.parse(text).error ?? msg } catch {}
    setError(msg); setStage('error'); return
  }
  const sign0 = await signRes0.json()
  studySetId = sign0.studySetId

  // Step B: direct upload to Supabase Storage
  const putRes0 = await window.fetch(sign0.signedUrl, {
    method: 'PUT',
    body: file0,
    headers: { 'Content-Type': file0.type },
  })
  if (!putRes0.ok) {
    setError('Storage upload failed for ' + file0.name); setStage('error'); return
  }

  // Step C: process
  const procRes0 = await window.fetch('/api/upload/process', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      rawStoragePath: sign0.rawStoragePath,
      fileName: file0.name,
      fileType: file0.type,
      studySetId: sign0.studySetId,
      documentId: sign0.documentId,
      isNewStudySet: true,
      name,
      subjectId: subjectId || null,
      customPrompt: customPrompt.trim() || null,
    }),
  })
  if (!procRes0.ok) {
    const text = await procRes0.text()
    let msg = 'Upload failed for ' + file0.name
    try { msg = JSON.parse(text).error ?? msg } catch {}
    setError(msg); setStage('error'); return
  }

  // Upload remaining files — attach to existing study set
  for (let i = 1; i < files.length; i++) {
    const file = files[i]

    const signRes = await window.fetch('/api/upload/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileType: file.type, fileSize: file.size, studySetId }),
    })
    if (!signRes.ok) {
      const text = await signRes.text()
      let msg = `Upload failed for ${file.name}`
      try { msg = JSON.parse(text).error ?? msg } catch {}
      setError(msg + '. You can add this file later from the dashboard.'); setStage('error'); return
    }
    const sign = await signRes.json()

    const putRes = await window.fetch(sign.signedUrl, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': file.type },
    })
    if (!putRes.ok) {
      setError(`Storage upload failed for ${file.name}. You can add this file later from the dashboard.`)
      setStage('error'); return
    }

    const procRes = await window.fetch('/api/upload/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rawStoragePath: sign.rawStoragePath,
        fileName: file.name,
        fileType: file.type,
        studySetId,
        documentId: sign.documentId,
        isNewStudySet: false,
      }),
    })
    if (!procRes.ok) {
      const text = await procRes.text()
      let msg = `Upload failed for ${file.name}`
      try { msg = JSON.parse(text).error ?? msg } catch {}
      setError(msg + '. You can add this file later from the dashboard.'); setStage('error'); return
    }
  }

  // Start generating
  setStage('generating')
  pollIntervalRef.current = setInterval(async () => {
    const r = await window.fetch(`/api/generate/status/${studySetId}`)
    const { questionCount: qc } = await r.json()
    setQuestionCount(qc)
  }, 3000)

  const genRes = await window.fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ studySetId, mode: 'regenerate' }),
  })

  clearInterval(pollIntervalRef.current ?? undefined)

  if (!genRes.ok) {
    const text = await genRes.text()
    let msg = 'Generation failed'
    try { msg = JSON.parse(text).error ?? msg } catch {}
    setError(msg); setStage('error'); return
  }

  setStage('done')
  setTimeout(() => router.push('/dashboard'), 1500)
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/upload/page.tsx
git commit -m "feat: update upload page to presigned 3-step flow"
```

---

## Task 5: Update AddDocumentModal to 3-step flow

**Files:**
- Modify: `components/dashboard/AddDocumentModal.tsx` (lines 73–95 — the file upload loop inside `handleConfirm`)

- [ ] **Step 1: Replace the upload loop in `handleConfirm`**

Find the existing upload loop in `handleConfirm` (starts at `for (const file of pendingFiles)`, around line 75). Replace the entire for loop (lines 75–94) with this 3-step version:

```typescript
for (const file of pendingFiles) {
  const fileKey = file.name + file.size
  if (newKeys[fileKey]) continue  // already uploaded in a previous attempt

  // Step A: sign
  const signRes = await window.fetch('/api/upload/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileType: file.type, fileSize: file.size, studySetId: studySet.id }),
  })
  if (!signRes.ok) {
    const text = await signRes.text()
    let msg = 'Upload failed for ' + file.name
    try { msg = JSON.parse(text).error ?? msg } catch {}
    setError(msg + '. Fix and try again.')
    setUploading(false)
    return
  }
  const sign = await signRes.json()

  // Step B: direct upload to Supabase Storage
  const putRes = await window.fetch(sign.signedUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type },
  })
  if (!putRes.ok) {
    setError(`Storage upload failed for ${file.name}. Fix and try again.`)
    setUploading(false)
    return
  }

  // Step C: process
  const procRes = await window.fetch('/api/upload/process', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      rawStoragePath: sign.rawStoragePath,
      fileName: file.name,
      fileType: file.type,
      studySetId: studySet.id,
      documentId: sign.documentId,
      isNewStudySet: false,
    }),
  })
  if (!procRes.ok) {
    const text = await procRes.text()
    let msg = 'Upload failed for ' + file.name
    try { msg = JSON.parse(text).error ?? msg } catch {}
    setError(msg + '. Fix and try again.')
    setUploading(false)
    return
  }
  const { documentId } = await procRes.json()
  newKeys[fileKey] = documentId
  setUploadedKeys({ ...newKeys })
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run tests**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add components/dashboard/AddDocumentModal.tsx
git commit -m "feat: update AddDocumentModal to presigned 3-step upload flow"
```

---

## Task 6: Manual integration test

Before deploying, do a quick local smoke test to confirm the new routes respond correctly.

> **Note:** The direct Supabase PUT (Step B) requires CORS to be configured on the `study-files` bucket. For local testing, add `http://localhost:3000` to the bucket's allowed origins in the Supabase dashboard (Storage → study-files → Policies/Settings). This is a one-time infrastructure step.
>
> Also set a 50 MB per-file size limit on the bucket in Supabase Storage settings.

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Test sign endpoint with curl**

```bash
curl -X POST http://localhost:3000/api/upload/sign \
  -H "Content-Type: application/json" \
  -H "Cookie: <paste your session cookie from browser devtools>" \
  -d '{"fileType":"application/pdf","fileSize":100000,"name":"Test Set"}'
```

Expected: `200` with `{ signedUrl, token, studySetId, documentId, rawStoragePath }`.

- [ ] **Step 3: Test the full flow in browser**

1. Navigate to `http://localhost:3000/upload`
2. Drop a PDF file (any size, including > 4 MB)
3. Enter a study set name
4. Click "Upload & Generate Questions"

Expected:
- No "Upload Failed" error
- Stage progresses to "Generating…"
- After generation completes, redirected to dashboard
- New study set appears in dashboard

- [ ] **Step 4: Test AddDocumentModal**

1. Open an existing study set's "Add Document" modal from the dashboard
2. Drop a PDF
3. Click "Confirm"

Expected: no error, generation starts.

- [ ] **Step 5: Commit any fixes found during testing**

```bash
git add -p
git commit -m "fix: <describe what was fixed>"
```

---

## Deployment checklist

Before pushing to production (Vercel):

- [ ] Configure `study-files` bucket CORS in Supabase dashboard: allow `PUT` from your Vercel production URL (e.g. `https://yourapp.vercel.app`) and any preview deployment URL patterns
- [ ] Set 50 MB per-file upload limit on the `study-files` bucket in Supabase Storage settings
- [ ] Push to GitHub → Vercel deploys automatically
- [ ] Smoke test on the deployed URL with a file > 4 MB — should succeed now
