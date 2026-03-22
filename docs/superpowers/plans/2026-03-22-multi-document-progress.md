# Multi-Document Study Sets & Progress UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow each study set to hold multiple uploaded documents and show a better progress screen during AI question generation.

**Architecture:** Add a `study_set_documents` junction table; update the upload API to attach documents to an existing set; update the generate API to concatenate multiple docs; improve the upload page progress screen; add an "Add Document" modal on the dashboard.

**Tech Stack:** Next.js 14 App Router, Supabase (PostgreSQL + Storage + RLS), TypeScript, React, Vitest

**Testing note:** API routes and React components are integration-tested via `npm run build` (TypeScript catches interface mismatches) and manual browser testing. Pure-logic changes get Vitest unit tests where applicable. Run `npm test` after each task that touches logic; run `npm run build` after each task that touches types or components.

---

### Task 1: Schema migration + type updates

**Files:**
- Create: `supabase/migrations/20260322000001_multi_document.sql`
- Modify: `types/index.ts`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260322000001_multi_document.sql

CREATE TABLE study_set_documents (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_set_id        uuid REFERENCES study_sets(id) ON DELETE CASCADE NOT NULL,
  file_name           text NOT NULL,
  file_type           text NOT NULL,
  extracted_text_path text NOT NULL,
  uploaded_at         timestamptz DEFAULT now()
);

ALTER TABLE study_set_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user owns study_set_documents" ON study_set_documents
  USING  (study_set_id IN (SELECT id FROM study_sets WHERE user_id = auth.uid()))
  WITH CHECK (study_set_id IN (SELECT id FROM study_sets WHERE user_id = auth.uid()));

-- Make legacy single-doc columns nullable
ALTER TABLE study_sets ALTER COLUMN file_name        DROP NOT NULL;
ALTER TABLE study_sets ALTER COLUMN file_type        DROP NOT NULL;
ALTER TABLE study_sets ALTER COLUMN extracted_text_path DROP NOT NULL;

-- Backfill existing study sets into study_set_documents
INSERT INTO study_set_documents (study_set_id, file_name, file_type, extracted_text_path)
SELECT id, file_name, file_type, extracted_text_path
FROM study_sets
WHERE extracted_text_path IS NOT NULL;
```

- [ ] **Step 2: Run the migration in Supabase**

Go to Supabase dashboard → SQL Editor → paste the migration SQL → Run.
Verify: the `study_set_documents` table appears in Table Editor.

- [ ] **Step 3: Update `types/index.ts`**

Add the new `StudySetDocument` interface and update `StudySet`:

```typescript
// types/index.ts
export type GenerationStatus = 'pending' | 'processing' | 'done' | 'error'
export type QuestionType = 'mcq' | 'short_answer'

export interface Subject {
  id: string
  user_id: string
  name: string
  color: string
  created_at: string
}

export interface StudySetDocument {
  id: string
  study_set_id: string
  file_name: string
  file_type: string
  extracted_text_path: string
  uploaded_at: string
}

export interface StudySet {
  id: string
  user_id: string
  subject_id: string | null
  name: string
  file_name: string | null            // nullable after migration
  file_type: string | null            // nullable after migration
  extracted_text_path: string | null  // nullable after migration
  generation_status: GenerationStatus
  last_studied_at: string | null
  created_at: string
  updated_at: string
  // joined / computed fields (not in DB columns)
  question_count?: number
  subject?: Subject | null
  documents: StudySetDocument[]       // always populated by useStudySets
}

export interface MCQOption {
  label: 'A' | 'B' | 'C' | 'D'
  text: string
}

export interface Question {
  id: string
  study_set_id: string
  type: QuestionType
  question_text: string
  options: MCQOption[] | null
  correct_answer: string
  created_at: string
}

export interface QuestionState {
  user_id: string
  question_id: string
  ease_factor: number
  interval: number
  repetitions: number
  next_review: string
  updated_at: string
}

export interface AnswerLog {
  id: string
  user_id: string
  question_id: string
  answer_given: string
  is_correct: boolean
  answered_at: string
}

export interface SM2Input {
  quality: 0 | 1 | 2 | 3 | 4 | 5
  easeFactor: number
  interval: number
  repetitions: number
}

export interface SM2Result {
  easeFactor: number
  interval: number
  repetitions: number
  nextReview: Date
}
```

- [ ] **Step 4: Verify build compiles**

```bash
npm run build
```

Expected: build succeeds (TypeScript will flag any remaining non-nullable usages — fix them if any appear; most are in the next tasks).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260322000001_multi_document.sql types/index.ts
git commit -m "feat: add study_set_documents table and update types"
```

---

### Task 2: Update Upload API to support multiple documents

**Files:**
- Modify: `app/api/upload/route.ts`

- [ ] **Step 1: Read the current file**

Open `app/api/upload/route.ts` and understand the current shape (creates one study_set row + uploads one .txt sidecar).

- [ ] **Step 2: Rewrite `app/api/upload/route.ts`**

```typescript
// app/api/upload/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { parseFile, SUPPORTED_TYPES } from '@/lib/parsers/index'

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
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: compiles without errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/upload/route.ts
git commit -m "feat: upload API supports attaching documents to existing study sets"
```

---

### Task 3: Update Generate API for multi-document mode

**Files:**
- Modify: `app/api/generate/route.ts`

- [ ] **Step 1: Rewrite `app/api/generate/route.ts`**

```typescript
// app/api/generate/route.ts
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
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: compiles without errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/generate/route.ts
git commit -m "feat: generate API supports multi-doc concatenation and append/regenerate modes"
```

---

### Task 4: Update Badge component to accept label or children

**Files:**
- Modify: `components/ui/Badge.tsx`

- [ ] **Step 1: Update the Badge component**

```typescript
// components/ui/Badge.tsx
interface BadgeProps {
  label?: string
  children?: React.ReactNode
  color?: string
}

export function Badge({ label, children, color = 'var(--accent-cyan)' }: BadgeProps) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold"
      style={{ background: color + '22', color }}>
      {label ?? children}
    </span>
  )
}
```

- [ ] **Step 2: Verify build (existing usages still work)**

```bash
npm run build
```

Expected: passes. All existing `<Badge label="..." />` calls continue working.

- [ ] **Step 3: Commit**

```bash
git add components/ui/Badge.tsx
git commit -m "feat: Badge accepts children as alternative to label prop"
```

---

### Task 5: Update DropZone to support multiple files

**Files:**
- Modify: `components/upload/DropZone.tsx`

- [ ] **Step 1: Rewrite `components/upload/DropZone.tsx`**

```typescript
// components/upload/DropZone.tsx
'use client'
import { useRef, useState } from 'react'

interface Props {
  onFiles: (files: File[]) => void
  disabled?: boolean
  multiple?: boolean
}

const LABELS: Record<string, string> = {
  'application/pdf': 'PDF', 'text/plain': 'TXT', 'text/markdown': 'MD',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PPTX',
}

// Kept in sync with lib/parsers/index.ts PARSERS map (server-only)
const SUPPORTED_TYPES = Object.keys(LABELS)

export function DropZone({ onFiles, disabled, multiple = false }: Props) {
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function validate(file: File): boolean {
    if (!SUPPORTED_TYPES.includes(file.type)) {
      setError(`Unsupported file type. Accepted: ${Object.values(LABELS).join(', ')}`)
      return false
    }
    if (file.size > 50 * 1024 * 1024) { setError('File too large (max 50MB)'); return false }
    return true
  }

  function handleFiles(incoming: File[]) {
    const valid = incoming.filter(validate)
    if (valid.length > 0) { setError(''); onFiles(valid) }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false)
    handleFiles(Array.from(e.dataTransfer.files))
  }

  return (
    <div>
      <div onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)} onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className="border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-colors"
        style={{ borderColor: dragging ? 'var(--accent-cyan)' : 'var(--bg-border)',
                 background: dragging ? 'var(--accent-cyan)11' : 'transparent' }}>
        <p className="font-display text-lg font-semibold mb-2">
          {multiple ? 'Drop your files here' : 'Drop your file here'}
        </p>
        <p className="text-sm mb-1" style={{ color: 'var(--text-muted)' }}>or click to browse</p>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {Object.values(LABELS).join(' · ')} · Max 50MB
        </p>
        <input ref={inputRef} type="file" className="hidden" disabled={disabled}
          multiple={multiple}
          accept={SUPPORTED_TYPES.join(',')}
          onChange={e => {
            const files = Array.from(e.target.files ?? [])
            if (files.length > 0) handleFiles(files)
            e.target.value = ''
          }} />
      </div>
      {error && <p className="mt-2 text-sm" style={{ color: 'var(--error)' }}>{error}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: TypeScript will flag the old `onFile` prop usage in `app/upload/page.tsx` — that is expected and will be fixed in Task 7. If the only errors are in upload/page.tsx, that is fine.

- [ ] **Step 3: Commit**

```bash
git add components/upload/DropZone.tsx
git commit -m "feat: DropZone supports multiple file selection"
```

---

### Task 6: Update useStudySets hook

**Files:**
- Modify: `hooks/useStudySets.ts`

- [ ] **Step 1: Rewrite `hooks/useStudySets.ts`**

```typescript
// hooks/useStudySets.ts
'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { StudySet, StudySetDocument, Subject, GenerationStatus } from '@/types'

export function useStudySets() {
  const [studySets, setStudySets] = useState<StudySet[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    const supabase = createClient()
    const [{ data: sets }, { data: subs }] = await Promise.all([
      supabase.from('study_sets').select('*, subject:subjects(*)').order('created_at', { ascending: false }),
      supabase.from('subjects').select('*').order('name'),
    ])

    if (sets) {
      // Batch fetch question counts (existing N+1 — out of scope to fix here)
      const withCounts = await Promise.all(sets.map(async (s) => {
        const { count } = await supabase.from('questions')
          .select('*', { count: 'exact', head: true }).eq('study_set_id', s.id)
        return { ...s, question_count: count ?? 0, documents: [] as StudySetDocument[] }
      }))

      // Batch fetch documents (single query)
      const setIds = withCounts.map(s => s.id)
      if (setIds.length > 0) {
        const { data: allDocs } = await supabase
          .from('study_set_documents')
          .select('*')
          .in('study_set_id', setIds)
          .order('uploaded_at')

        const docsBySet = (allDocs ?? []).reduce((acc, doc) => {
          (acc[doc.study_set_id] ??= []).push(doc)
          return acc
        }, {} as Record<string, StudySetDocument[]>)

        withCounts.forEach(s => { s.documents = docsBySet[s.id] ?? [] })
      }

      setStudySets(withCounts)
    }
    if (subs) setSubjects(subs)
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  async function renameSet(id: string, name: string) {
    const supabase = createClient()
    await supabase.from('study_sets').update({ name }).eq('id', id)
    setStudySets(prev => prev.map(s => s.id === id ? { ...s, name } : s))
  }

  async function deleteSet(id: string) {
    const supabase = createClient()
    await supabase.from('study_sets').delete().eq('id', id)
    setStudySets(prev => prev.filter(s => s.id !== id))
  }

  async function assignSubject(id: string, subjectId: string | null) {
    const supabase = createClient()
    await supabase.from('study_sets').update({ subject_id: subjectId }).eq('id', id)
    await loadData()
  }

  async function refreshSet(id: string) {
    const supabase = createClient()
    await supabase.from('study_sets').update({ generation_status: 'pending' }).eq('id', id)
    await window.fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studySetId: id, mode: 'regenerate' }),
    })
    await loadData()
  }

  function updateSetStatus(id: string, status: GenerationStatus) {
    setStudySets(prev =>
      prev.map(s => s.id === id ? { ...s, generation_status: status } : s)
    )
  }

  return {
    studySets, subjects, loading,
    renameSet, deleteSet, assignSubject,
    refreshSet, updateSetStatus,
    refresh: loadData,
  }
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: passes (or only fails on files that consume `StudySet.documents` — those are fixed in subsequent tasks).

- [ ] **Step 3: Commit**

```bash
git add hooks/useStudySets.ts
git commit -m "feat: useStudySets batches document fetch and exposes updateSetStatus"
```

---

### Task 7: Update StudySetCard

**Files:**
- Modify: `components/dashboard/StudySetCard.tsx`

- [ ] **Step 1: Rewrite `components/dashboard/StudySetCard.tsx`**

```typescript
// components/dashboard/StudySetCard.tsx
'use client'
import Link from 'next/link'
import { Badge } from '@/components/ui/Badge'
import { ProgressRing } from '@/components/ui/ProgressRing'
import { RenameInput } from './RenameInput'
import type { StudySet, Subject } from '@/types'

interface Props {
  studySet: StudySet
  subjects: Subject[]
  onRename: (name: string) => void
  onDelete: () => void
  onRefresh: () => void
  onAssignSubject: (subjectId: string | null) => void
  onAddDocument: () => void
}

export function StudySetCard({
  studySet, subjects, onRename, onDelete, onRefresh, onAssignSubject, onAddDocument
}: Props) {
  const mastery = 0
  const lastStudied = studySet.last_studied_at
    ? new Date(studySet.last_studied_at).toLocaleDateString()
    : 'Never'
  const docCount = studySet.documents.length

  return (
    <div className="rounded-xl border p-4 flex items-start gap-4 group"
      style={{ background: 'var(--bg-surface)', borderColor: 'var(--bg-border)' }}>
      <ProgressRing value={mastery} max={100} size={52} />
      <div className="flex-1 min-w-0">
        <RenameInput value={studySet.name} onSave={onRename} />
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <Badge label={`${docCount} ${docCount === 1 ? 'doc' : 'docs'}`} />
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {studySet.question_count} questions · Last studied {lastStudied}
          </span>
        </div>
        <select className="mt-2 text-xs rounded-md px-2 py-1"
          style={{ background: 'var(--bg-base)', border: '1px solid var(--bg-border)', color: 'var(--text-muted)' }}
          value={studySet.subject_id ?? ''}
          onChange={e => onAssignSubject(e.target.value || null)}>
          <option value="">Uncategorised</option>
          {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <div className="flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        {studySet.generation_status === 'done' && (
          <Link href={`/study/${studySet.id}`}
            className="px-3 py-1 rounded-lg text-xs font-semibold"
            style={{ background: 'var(--accent-cyan)', color: 'var(--bg-base)' }}>
            Study
          </Link>
        )}
        {studySet.generation_status === 'error' && (
          <span className="text-xs" style={{ color: 'var(--error)' }}>Generation failed</span>
        )}
        {studySet.generation_status === 'processing' && (
          <span className="text-xs" style={{ color: 'var(--accent-amber)' }}>Generating…</span>
        )}
        {studySet.generation_status !== 'processing' && (
          <button onClick={onAddDocument} className="px-3 py-1 rounded-lg text-xs"
            style={{ color: 'var(--accent-cyan)', border: '1px solid var(--accent-cyan)' }}>
            + Doc
          </button>
        )}
        <button onClick={onRefresh} className="px-3 py-1 rounded-lg text-xs"
          style={{ color: 'var(--text-muted)', border: '1px solid var(--bg-border)' }}>
          Refresh
        </button>
        <button onClick={onDelete} className="px-3 py-1 rounded-lg text-xs"
          style={{ color: 'var(--error)', border: '1px solid var(--error)' }}>
          Delete
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: TypeScript will flag `SubjectGroup` for missing `onAddDocument` prop — that is expected and fixed in the next task.

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/StudySetCard.tsx
git commit -m "feat: StudySetCard shows doc count badge and Add Document button"
```

---

### Task 8: Update SubjectGroup to thread onAddDocument

**Files:**
- Modify: `components/dashboard/SubjectGroup.tsx`

- [ ] **Step 1: Rewrite `components/dashboard/SubjectGroup.tsx`**

```typescript
// components/dashboard/SubjectGroup.tsx
'use client'
import { useState } from 'react'
import { StudySetCard } from './StudySetCard'
import type { StudySet, Subject } from '@/types'

interface Props {
  title: string
  color?: string
  studySets: StudySet[]
  subjects: Subject[]
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
  onAssignSubject: (id: string, subjectId: string | null) => void
  onRefresh: (id: string) => void
  onAddDocument: (id: string) => void
}

export function SubjectGroup({
  title, color, studySets, subjects,
  onRename, onDelete, onAssignSubject, onRefresh, onAddDocument
}: Props) {
  const [open, setOpen] = useState(true)
  if (studySets.length === 0) return null

  return (
    <section className="mb-8">
      <button className="flex items-center gap-2 mb-3 group" onClick={() => setOpen(o => !o)}>
        {color && <span className="w-3 h-3 rounded-full" style={{ background: color }} />}
        <h2 className="font-display font-bold text-lg">{title}</h2>
        <span style={{ color: 'var(--text-muted)' }} className="text-sm">({studySets.length})</span>
        <span style={{ color: 'var(--text-muted)' }}>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="space-y-3">
          {studySets.map(s => (
            <StudySetCard key={s.id} studySet={s} subjects={subjects}
              onRename={name => onRename(s.id, name)}
              onDelete={() => onDelete(s.id)}
              onRefresh={() => onRefresh(s.id)}
              onAssignSubject={subjectId => onAssignSubject(s.id, subjectId)}
              onAddDocument={() => onAddDocument(s.id)} />
          ))}
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: TypeScript will flag `app/dashboard/page.tsx` for missing `onAddDocument` prop — that is expected and fixed in Task 11.

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/SubjectGroup.tsx
git commit -m "feat: SubjectGroup threads onAddDocument to StudySetCard"
```

---

### Task 9: Create AddDocumentModal component

**Files:**
- Create: `components/dashboard/AddDocumentModal.tsx`

- [ ] **Step 1: Create `components/dashboard/AddDocumentModal.tsx`**

```typescript
// components/dashboard/AddDocumentModal.tsx
'use client'
import { useState } from 'react'
import { DropZone } from '@/components/upload/DropZone'
import { Button } from '@/components/ui/Button'
import type { StudySet, GenerationStatus } from '@/types'

interface Props {
  studySet: StudySet
  onClose: () => void
  onStatusChange: (id: string, status: GenerationStatus) => void
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function AddDocumentModal({ studySet, onClose, onStatusChange }: Props) {
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [uploadedDocIds, setUploadedDocIds] = useState<string[]>([])
  const [mode, setMode] = useState<'append' | 'regenerate'>('append')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  function addPending(incoming: File[]) {
    setPendingFiles(prev => {
      const existing = new Set(prev.map(f => f.name + f.size))
      return [...prev, ...incoming.filter(f => !existing.has(f.name + f.size))]
    })
  }

  function removeFile(index: number) {
    if (uploading) return
    setPendingFiles(prev => prev.filter((_, i) => i !== index))
  }

  async function handleConfirm() {
    if (pendingFiles.length === 0) return
    setUploading(true)
    setError('')

    const newDocIds: string[] = [...uploadedDocIds]
    const remainingFiles = pendingFiles.slice(uploadedDocIds.length)

    for (const file of remainingFiles) {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('studySetId', studySet.id)

      const res = await window.fetch('/api/upload', { method: 'POST', body: fd })
      if (!res.ok) {
        const text = await res.text()
        let msg = 'Upload failed for ' + file.name
        try { msg = JSON.parse(text).error ?? msg } catch {}
        setError(msg + '. Fix and try again.')
        setUploading(false)
        return
      }
      const { documentId } = await res.json()
      newDocIds.push(documentId)
      setUploadedDocIds([...newDocIds])
    }

    // All uploads succeeded — trigger generation
    const body: Record<string, unknown> = { studySetId: studySet.id, mode }
    if (mode === 'append') body.documentIds = newDocIds

    await window.fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    onStatusChange(studySet.id, 'processing')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="rounded-2xl p-6 w-full max-w-lg mx-4"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--bg-border)' }}>
        <h2 className="font-display text-xl font-bold mb-4">Add Document</h2>

        {/* Section 1: existing documents */}
        {studySet.documents.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>
              EXISTING DOCUMENTS
            </p>
            <ul className="space-y-1">
              {studySet.documents.map(doc => (
                <li key={doc.id} className="flex items-center justify-between text-sm">
                  <span>{doc.file_name}</span>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {formatDate(doc.uploaded_at)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Section 2: new files */}
        <DropZone multiple onFiles={addPending} disabled={uploading} />

        {pendingFiles.length > 0 && (
          <ul className="mt-3 space-y-1">
            {pendingFiles.map((f, i) => (
              <li key={i} className="flex items-center justify-between text-sm">
                <span>{f.name} ({(f.size / 1024).toFixed(0)} KB)</span>
                <button
                  onClick={() => removeFile(i)}
                  disabled={uploading}
                  className="text-xs ml-2"
                  style={{ color: 'var(--error)', opacity: uploading ? 0.4 : 1 }}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Section 3: mode selector */}
        {pendingFiles.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
              WHAT TO DO WITH QUESTIONS
            </p>
            <label className="flex items-start gap-2 cursor-pointer">
              <input type="radio" name="mode" value="append"
                checked={mode === 'append'} onChange={() => setMode('append')} className="mt-0.5" />
              <span className="text-sm">Add to existing questions</span>
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <input type="radio" name="mode" value="regenerate"
                checked={mode === 'regenerate'} onChange={() => setMode('regenerate')} className="mt-0.5" />
              <span className="text-sm">Delete all questions and regenerate from all documents</span>
            </label>
          </div>
        )}

        {error && (
          <p className="mt-3 text-sm" style={{ color: 'var(--error)' }}>{error}</p>
        )}

        <div className="flex gap-3 mt-6 justify-end">
          <Button variant="ghost" onClick={onClose} disabled={uploading}>Cancel</Button>
          <Button onClick={handleConfirm}
            disabled={pendingFiles.length === 0 || uploading}>
            {uploading ? 'Uploading…' : 'Confirm'}
          </Button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: compiles without errors.

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/AddDocumentModal.tsx
git commit -m "feat: AddDocumentModal component for adding documents to existing study sets"
```

---

### Task 10: Update Upload page for multi-file

**Files:**
- Modify: `app/upload/page.tsx`

- [ ] **Step 1: Rewrite `app/upload/page.tsx`**

```typescript
// app/upload/page.tsx
'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { DropZone } from '@/components/upload/DropZone'
import { SubjectSelector } from '@/components/upload/SubjectSelector'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { Input } from '@/components/ui/Input'
import { createClient } from '@/lib/supabase/client'
import type { Subject } from '@/types'

type Stage = 'idle' | 'uploading' | 'generating' | 'done' | 'error'

export default function UploadPage() {
  const router = useRouter()
  const [files, setFiles] = useState<File[]>([])
  const [name, setName] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [stage, setStage] = useState<Stage>('idle')
  const [error, setError] = useState('')
  const [questionCount, setQuestionCount] = useState(0)
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => { if (pollIntervalRef.current) clearInterval(pollIntervalRef.current) }
  }, [])

  useEffect(() => {
    createClient().from('subjects').select('*').order('name')
      .then(({ data }) => { if (data) setSubjects(data) })
  }, [])

  function addFiles(incoming: File[]) {
    setFiles(prev => {
      const existing = new Set(prev.map(f => f.name + f.size))
      const newOnes = incoming.filter(f => !existing.has(f.name + f.size))
      if (prev.length === 0 && newOnes.length > 0 && !name) {
        setName(newOnes[0].name.replace(/\.[^/.]+$/, ''))
      }
      return [...prev, ...newOnes]
    })
  }

  function removeFile(index: number) {
    setFiles(prev => prev.filter((_, i) => i !== index))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (files.length === 0) return
    setError('')
    setStage('uploading')

    // Upload first file — creates the study set
    const fd0 = new FormData()
    fd0.append('file', files[0])
    fd0.append('name', name)
    if (subjectId) fd0.append('subjectId', subjectId)

    const firstRes = await window.fetch('/api/upload', { method: 'POST', body: fd0 })
    if (!firstRes.ok) {
      const text = await firstRes.text()
      let msg = 'Upload failed'
      try { msg = JSON.parse(text).error ?? msg } catch {}
      setError(msg)
      setStage('error')
      return
    }
    const { studySetId } = await firstRes.json()

    // Upload remaining files — attach to existing study set
    for (let i = 1; i < files.length; i++) {
      const fd = new FormData()
      fd.append('file', files[i])
      fd.append('studySetId', studySetId)
      const res = await window.fetch('/api/upload', { method: 'POST', body: fd })
      if (!res.ok) {
        const text = await res.text()
        let msg = `Upload failed for ${files[i].name}`
        try { msg = JSON.parse(text).error ?? msg } catch {}
        setError(msg + '. You can add this file later from the dashboard.')
        setStage('error')
        return
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
      setError(msg)
      setStage('error')
      return
    }

    setStage('done')
    setTimeout(() => router.push('/dashboard'), 1500)
  }

  return (
    <main className="min-h-screen p-6 max-w-xl mx-auto">
      <h1 className="font-display text-3xl font-bold mb-8">New Study Set</h1>

      {stage === 'generating' && (
        <div className="text-center py-16">
          <Spinner size={40} />
          <p className="mt-4 font-display font-semibold text-lg">Generating your questions…</p>
          {questionCount > 0 && (
            <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
              {questionCount} questions created so far
            </p>
          )}
          <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
            This usually takes 1–3 minutes
          </p>
          <button
            onClick={() => router.push('/dashboard')}
            className="mt-6 text-sm underline"
            style={{ color: 'var(--text-muted)' }}>
            Leave — I'll check later
          </button>
        </div>
      )}

      {stage === 'done' && (
        <div className="text-center py-16">
          <p className="font-display text-2xl font-bold" style={{ color: 'var(--success)' }}>Done!</p>
          <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>Redirecting to dashboard…</p>
        </div>
      )}

      {(stage === 'idle' || stage === 'uploading' || stage === 'error') && (
        <form onSubmit={handleSubmit} className="space-y-6">
          <DropZone multiple onFiles={addFiles} disabled={stage === 'uploading'} />

          {/* File chip list */}
          {files.length > 0 && (
            <ul className="space-y-1">
              {files.map((f, i) => (
                <li key={i} className="flex items-center justify-between text-sm rounded-lg px-3 py-2"
                  style={{ background: 'var(--bg-surface)', border: '1px solid var(--bg-border)' }}>
                  <span>{f.name} <span style={{ color: 'var(--text-muted)' }}>({(f.size / 1024).toFixed(0)} KB)</span></span>
                  <button type="button"
                    onClick={() => removeFile(i)}
                    disabled={stage === 'uploading'}
                    className="ml-3 text-xs"
                    style={{ color: 'var(--error)', opacity: stage === 'uploading' ? 0.4 : 1 }}>
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}

          {files.length > 0 && (
            <>
              <div>
                <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>
                  Study Set Name
                </label>
                <Input value={name} onChange={e => setName(e.target.value)}
                  placeholder="e.g. Chapter 4 Notes" required />
              </div>
              <SubjectSelector subjects={subjects} value={subjectId} onChange={setSubjectId} />
              {error && <p className="text-sm" style={{ color: 'var(--error)' }}>{error}</p>}
              <Button type="submit"
                disabled={stage === 'uploading' || files.length === 0 || !name.trim()}
                className="w-full">
                {stage === 'uploading' ? 'Uploading…' : 'Upload & Generate Questions'}
              </Button>
            </>
          )}
        </form>
      )}
    </main>
  )
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: compiles without errors. Only remaining failure should be `app/dashboard/page.tsx` missing `onAddDocument` — fixed next.

- [ ] **Step 3: Commit**

```bash
git add app/upload/page.tsx
git commit -m "feat: upload page supports multiple files with chip list and improved progress screen"
```

---

### Task 11: Update Dashboard page to wire AddDocumentModal

**Files:**
- Modify: `app/dashboard/page.tsx`

- [ ] **Step 1: Rewrite `app/dashboard/page.tsx`**

```typescript
// app/dashboard/page.tsx
'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useStudySets } from '@/hooks/useStudySets'
import { SubjectGroup } from '@/components/dashboard/SubjectGroup'
import { AddDocumentModal } from '@/components/dashboard/AddDocumentModal'
import { Spinner } from '@/components/ui/Spinner'
import { Button } from '@/components/ui/Button'
import type { StudySet } from '@/types'

export default function DashboardPage() {
  const {
    studySets, subjects, loading,
    renameSet, deleteSet, assignSubject, refreshSet, updateSetStatus,
  } = useStudySets()

  const [addDocTarget, setAddDocTarget] = useState<StudySet | null>(null)

  const grouped = subjects.map(sub => ({
    subject: sub,
    sets: studySets.filter(s => s.subject_id === sub.id),
  }))
  const uncategorised = studySets.filter(s => !s.subject_id)

  function handleAddDocument(id: string) {
    const set = studySets.find(s => s.id === id)
    if (set) setAddDocTarget(set)
  }

  return (
    <main className="min-h-screen p-6 max-w-3xl mx-auto">
      <header className="flex items-center justify-between mb-10">
        <h1 className="font-display text-4xl font-extrabold" style={{ color: 'var(--accent-cyan)' }}>
          SmartStudy
        </h1>
        <div className="flex gap-3">
          <Link href="/settings"><Button variant="ghost" size="sm">Settings</Button></Link>
          <Link href="/upload"><Button size="sm">+ New Study Set</Button></Link>
        </div>
      </header>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner size={32} /></div>
      ) : studySets.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-lg mb-4" style={{ color: 'var(--text-muted)' }}>No study sets yet.</p>
          <Link href="/upload"><Button>Upload your first file</Button></Link>
        </div>
      ) : (
        <>
          {grouped.map(({ subject, sets }) => (
            <SubjectGroup key={subject.id} title={subject.name} color={subject.color}
              studySets={sets} subjects={subjects}
              onRename={renameSet} onDelete={deleteSet}
              onAssignSubject={assignSubject} onRefresh={refreshSet}
              onAddDocument={handleAddDocument} />
          ))}
          <SubjectGroup title="Uncategorised" studySets={uncategorised} subjects={subjects}
            onRename={renameSet} onDelete={deleteSet}
            onAssignSubject={assignSubject} onRefresh={refreshSet}
            onAddDocument={handleAddDocument} />
        </>
      )}

      {addDocTarget && (
        <AddDocumentModal
          studySet={addDocTarget}
          onClose={() => setAddDocTarget(null)}
          onStatusChange={updateSetStatus}
        />
      )}
    </main>
  )
}
```

- [ ] **Step 2: Verify full build passes**

```bash
npm run build
```

Expected: ✓ Compiled successfully — zero TypeScript errors.

- [ ] **Step 3: Run existing tests to confirm nothing regressed**

```bash
npm test
```

Expected: all existing tests pass (SM-2, chunk-text, grade-short-answer, parsers).

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/page.tsx
git commit -m "feat: dashboard wires AddDocumentModal with optimistic status update"
```

---

### Task 12: End-to-end verification and push

- [ ] **Step 1: Final build**

```bash
npm run build
```

Expected: zero errors, zero TypeScript errors.

- [ ] **Step 2: Run tests**

```bash
npm test
```

Expected: all 26 tests pass.

- [ ] **Step 3: Manual smoke test (local)**

```bash
npm run dev
```

1. Navigate to `/upload` → drop two files → verify both appear as chips → submit → verify progress screen shows "questions created so far" → verify redirect to dashboard
2. On dashboard → hover a card → click "+ Doc" → verify modal opens showing existing documents → add a new file → select "Add to existing" → Confirm → verify card shows "Generating…"
3. Check Supabase Table Editor → `study_set_documents` should show rows for the study set

- [ ] **Step 4: Push and deploy**

```bash
git push
```

Vercel will auto-deploy. After deploy, run the same smoke test on the production URL.
