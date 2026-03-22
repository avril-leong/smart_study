# Multi-Document Study Sets & Generation Progress Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow each study set to contain multiple uploaded documents, and improve the question generation progress UI.

**Architecture:** Add a `study_set_documents` junction table; update upload, generate, and dashboard flows to support multiple files per set. Progress UI uses the existing polling mechanism with improved visuals.

**Tech Stack:** Next.js 14 App Router, Supabase (PostgreSQL + Storage + RLS), TypeScript, Tailwind/CSS variables

---

## Changed Files Summary

| File | Change |
|------|--------|
| `supabase/migrations/20260322000001_multi_document.sql` | New migration |
| `types/index.ts` | Add `StudySetDocument`; update `StudySet` nullable fields |
| `app/api/upload/route.ts` | Accept optional `studySetId`; skip `name`/`subjectId` when attaching to existing set |
| `app/api/generate/route.ts` | Multi-doc fetch; `mode` + `documentIds` params |
| `components/upload/DropZone.tsx` | Add `multiple` prop; change callback to `onFiles: (files: File[]) => void` |
| `app/upload/page.tsx` | Multi-file state; per-file chips; improved progress screen |
| `components/ui/Badge.tsx` | Accept optional `label` or `children` (see Badge section) |
| `components/dashboard/StudySetCard.tsx` | Handle nullable `file_type`; add "Add Document" button; add `onAddDocument` prop |
| `components/dashboard/SubjectGroup.tsx` | Thread new `onAddDocument` prop through to `StudySetCard` |
| `components/dashboard/AddDocumentModal.tsx` | New component |
| `hooks/useStudySets.ts` | Batch-fetch `study_set_documents`; expose `updateSetStatus`; update `refreshSet` |
| `app/dashboard/page.tsx` | Manage `AddDocumentModal` open state; pass `updateSetStatus` |

The upload API response shape changes from `{ studySetId }` to `{ studySetId, documentId }`. The only consumers of this response are `app/upload/page.tsx` and `AddDocumentModal.tsx` — both are listed above. No other file reads the upload response.

---

## Schema

### Migration: `supabase/migrations/20260322000001_multi_document.sql`

```sql
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

-- Make legacy single-doc columns nullable on study_sets
ALTER TABLE study_sets ALTER COLUMN file_name        DROP NOT NULL;
ALTER TABLE study_sets ALTER COLUMN file_type        DROP NOT NULL;
ALTER TABLE study_sets ALTER COLUMN extracted_text_path DROP NOT NULL;

-- Backfill all existing study sets into study_set_documents.
-- Backfilled rows use the old storage path format ({userId}/{studySetId}.txt).
-- The generate API downloads paths directly from study_set_documents.extracted_text_path,
-- so old-format paths work unchanged — Supabase Storage resolves them correctly.
-- No storage path migration is required.
INSERT INTO study_set_documents (study_set_id, file_name, file_type, extracted_text_path)
SELECT id, file_name, file_type, extracted_text_path
FROM study_sets
WHERE extracted_text_path IS NOT NULL;
-- Legacy columns are left populated but unused after this migration.
```

**Storage RLS compatibility:** The existing policy checks `(storage.foldername(name))[1] = auth.uid()::text`. The new path `{userId}/{studySetId}/{documentId}.txt` still has `userId` as segment [1], so the existing policy requires no changes.

---

## Types (`types/index.ts`)

### New interface

```typescript
export interface StudySetDocument {
  id: string
  study_set_id: string
  file_name: string
  file_type: string
  extracted_text_path: string
  uploaded_at: string
}
```

### Updated `StudySet` interface

Change these three fields to nullable and add `documents` (new field, not a rename):

```typescript
file_name: string | null            // was: string
file_type: string | null            // was: string
extracted_text_path: string | null  // was: string
documents: StudySetDocument[]       // new; always populated by useStudySets (never undefined)
```

All other `StudySet` fields are unchanged.

---

## Upload API (`app/api/upload/route.ts`)

### Request (FormData)

| Field | When required | Notes |
|-------|---------------|-------|
| `file` | always | |
| `name` | only when `studySetId` absent | 400 if missing when creating a new set |
| `subjectId` | optional, only when `studySetId` absent | Omitting is valid — subject linkage is optional |
| `studySetId` | only when attaching to existing set | If present, `name` and `subjectId` are ignored |

### Behaviour

1. Validate auth, file size, MIME type (unchanged).
2. Extract text from file (unchanged).
3. If `studySetId` **absent** (new set):
   - Validate `name` is present (400 if missing).
   - `studySetId = crypto.randomUUID()`, `documentId = crypto.randomUUID()`.
   - Storage path: `{userId}/{studySetId}/{documentId}.txt`.
   - Upload `.txt` sidecar.
   - Insert `study_sets` row: `{ id: studySetId, user_id, subject_id: subjectId || null, name, file_name: null, file_type: null, extracted_text_path: null, generation_status: 'pending' }`.
   - Insert `study_set_documents` row.
4. If `studySetId` **present** (existing set):
   - Verify ownership (403 if not found or not owned).
   - `documentId = crypto.randomUUID()`.
   - Storage path: `{userId}/{studySetId}/{documentId}.txt`.
   - Upload `.txt` sidecar.
   - Insert `study_set_documents` row only.

### Response

```typescript
{ studySetId: string, documentId: string }
```

---

## Generate API (`app/api/generate/route.ts`)

### Request body

```typescript
{
  studySetId: string
  mode?: 'append' | 'regenerate'  // default: 'regenerate'
  documentIds?: string[]
  // Required when mode === 'append'; return 400 if mode is 'append' and documentIds is absent or empty.
  // Ignored (and not validated) when mode === 'regenerate'.
}
```

### Short-circuit rules

| `generation_status` | mode | Action |
|---------------------|------|--------|
| `'processing'` | any | Return `{ ok: true, message: 'Already processing' }` |
| any other | any | Proceed |

The existing `'done'` short-circuit from the current code is intentionally removed. A `'done'` set can now be re-triggered (e.g., after adding new documents). The only guard is against concurrent processing runs.

### Behaviour

1. Verify ownership.
2. Apply short-circuit rule.
3. Validate: if `mode === 'append'` and `documentIds` is absent or empty, return 400 `{ error: 'documentIds required for append mode' }`.
4. If `mode === 'regenerate'` (or absent): `DELETE FROM questions WHERE study_set_id = studySetId`.
5. Set `generation_status = 'processing'`.
6. Fetch documents:
   - `mode === 'append'`: fetch `study_set_documents` rows matching `documentIds`.
   - `mode === 'regenerate'`: fetch all `study_set_documents` for the study set.
   - If zero rows returned: return 500 `{ error: 'No documents found for this study set' }`.
7. Download each `.txt` sidecar, concatenate with `\n\n---\n\n`.
8. Run `generateQuestions(combinedText, studySetId)`.
9. Bulk-insert questions.
10. Set `generation_status = 'done'` on success, `'error'` on failure.

---

## Badge Component (`components/ui/Badge.tsx`)

Currently: `interface BadgeProps { label: string; color?: string }`.

Update to accept either `label` or `children`:

```typescript
interface BadgeProps {
  label?: string
  children?: React.ReactNode
  color?: string
}
export function Badge({ label, children, color = 'var(--accent-cyan)' }: BadgeProps) {
  return (
    <span ...>
      {label ?? children}
    </span>
  )
}
```

Existing usages that pass `label` continue to work unchanged.

---

## DropZone Component (`components/upload/DropZone.tsx`)

```typescript
interface Props {
  onFiles: (files: File[]) => void   // changed from: onFile: (file: File) => void
  disabled?: boolean
  multiple?: boolean                  // new; default: false
}
```

- `multiple` false (default): accepts one file, calls `onFiles([file])`.
- `multiple` true: accepts multiple files; calls `onFiles(filesArray)`.
- Invalid files excluded from callback; errors shown.

---

## Upload Page (`app/upload/page.tsx`)

### State

Replace `file: File | null` with `files: File[]`. `Stage` type unchanged.

### File deduplication

`addFiles(incoming)` deduplicates against current `files` by `name + size` (same name, different size = different file; same name + same size = duplicate, silently dropped).

### UI

Updated DropZone JSX (replaces the existing `<DropZone onFile={handleFile} ... />`):
```tsx
<DropZone multiple onFiles={addFiles} disabled={stage === 'uploading'} />
```

- Chip list below drop zone: `filename (size) ✕`. The ✕ button is disabled when `stage === 'uploading'` to prevent mid-upload list changes that would break the resume-by-index logic in the error recovery path.
- Name auto-fills from `files[0].name` (strip extension) when first file added and name is empty.
- Submit disabled until `files.length > 0` and `name.trim()` non-empty.

### Submit flow

```
stage → 'uploading'

POST /api/upload { file: files[0], name, subjectId }
  → { studySetId, documentId }   // documentId not needed here, can be discarded

for files[1..N]:
  POST /api/upload { file, studySetId }

stage → 'generating'
start polling /api/generate/status/{studySetId} every 3s (same as existing logic)

POST /api/generate { studySetId, mode: 'regenerate' }
  ← await this response for error detection

if generate response not ok:
  clearInterval(pollInterval)
  stage → 'error', show error message

if generate response ok:
  clearInterval(pollInterval)
  stage → 'done'
  setTimeout(() => router.push('/dashboard'), 1500)
```

If files[0] upload fails: `stage → 'error'`, error shown, no `study_sets` row created.
If files[1+] upload fails: `stage → 'error'`, error shown, `study_sets` row exists, user retries via "Add Document".

The "Leave" button (shown during `stage === 'generating'`) calls `router.push('/dashboard')`. The `useEffect` cleanup in the component clears the poll interval on unmount. The in-flight `POST /api/generate` request continues running server-side — the user just won't see the error/done transition. On dashboard, the card reflects the live `generation_status`.

### Progress screen (stage === 'generating')

```
[Spinner 40px]
Generating your questions…
[subtitle: "42 questions created so far"  ← updated by 3s poll]
[muted: "This usually takes 1–3 minutes"]
[Leave — I'll check later]  ← router.push('/dashboard')
```

---

## `useStudySets` Hook (`hooks/useStudySets.ts`)

### `fetch()` — batch document query

```typescript
const setIds = studySets.map(s => s.id)

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

  studySets.forEach(s => { s.documents = docsBySet[s.id] ?? [] })
} else {
  studySets.forEach(s => { s.documents = [] })
}
```

### Updated return value

```typescript
return {
  studySets, subjects, loading,
  renameSet, deleteSet, assignSubject,
  refreshSet,          // updated (see below)
  updateSetStatus,     // new
  refresh: fetch,
}
```

### Updated `refreshSet(id: string)` — signature unchanged

The existing hook has an internal async function (currently called `fetch` in the hook body, aliased as `refresh` in the return value). To avoid confusion with the browser `fetch` global, rename the internal loading function to `loadData` in this hook. Update `refreshSet` and the return value accordingly:

```typescript
async function refreshSet(id: string) {
  await supabase.from('study_sets').update({ generation_status: 'pending' }).eq('id', id)
  await fetch('/api/generate', {   // this is the browser fetch, correctly targeting the API
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ studySetId: id, mode: 'regenerate' }),
  })
  await loadData()   // reload hook state — was previously called refresh() or fetch()
}
```

Call sites (the "Retry" button on `StudySetCard`) pass only `id` — no changes required.

### New `updateSetStatus(id: string, status: GenerationStatus)`

```typescript
function updateSetStatus(id: string, status: GenerationStatus) {
  setStudySets(prev =>
    prev.map(s => s.id === id ? { ...s, generation_status: status } : s)
  )
}
```

`GenerationStatus` is imported from `@/types`.

---

## StudySetCard (`components/dashboard/StudySetCard.tsx`)

- Remove the existing `FILE_TYPE_LABELS` constant, its import, and the line that renders `<Badge label={FILE_TYPE_LABELS[studySet.file_type] ...} />` entirely.
- Replace with a document count badge:
  ```tsx
  const docCount = studySet.documents.length
  <Badge label={`${docCount} ${docCount === 1 ? 'doc' : 'docs'}`} />
  ```
- Add `onAddDocument: () => void` prop.
- Add **"Add Document"** button (secondary/ghost style), shown only when `generation_status !== 'processing'`. On click: `onAddDocument()`.

---

## SubjectGroup (`components/dashboard/SubjectGroup.tsx`)

Add `onAddDocument: (id: string) => void` to `Props`.

Thread it to `StudySetCard`:
```tsx
<StudySetCard
  ...existing props...
  onAddDocument={() => onAddDocument(s.id)}
/>
```

---

## Add Document Modal (`components/dashboard/AddDocumentModal.tsx`)

Imports needed: `StudySet`, `StudySetDocument`, `GenerationStatus` from `@/types`.

### Props

```typescript
interface Props {
  studySet: StudySet
  onClose: () => void
  onStatusChange: (id: string, status: GenerationStatus) => void
}
```

### State

```typescript
const [pendingFiles, setPendingFiles] = useState<File[]>([])
const [uploadedDocIds, setUploadedDocIds] = useState<string[]>([])  // tracks successful uploads
const [mode, setMode] = useState<'append' | 'regenerate'>('append')
const [uploading, setUploading] = useState(false)
const [error, setError] = useState('')
```

### Sections

**Section 1 — Existing documents (read-only)**
List `studySet.documents`: `file_name` + formatted `uploaded_at` per row.

**Section 2 — New files**
`<DropZone multiple onFiles={addPending} />` + chip list.

`addPending` deduplicates by `name + size` against `pendingFiles`.

**Section 3 — Mode selector** (visible only when `pendingFiles.length > 0`):
Radio, default `'append'`:
- "Add to existing questions" → `'append'`
- "Delete all questions and regenerate from all documents" → `'regenerate'`

### On confirm

```typescript
setUploading(true); setError('')

const newDocIds: string[] = [...uploadedDocIds]  // resume from previous partial attempt

const remainingFiles = pendingFiles.filter((_, i) => i >= uploadedDocIds.length)

for (const file of remainingFiles) {
  const res = await fetch('/api/upload', { method: 'POST', body: formDataFor(file, studySet.id) })
  if (!res.ok) {
    setError('Upload failed for ' + file.name + '. Fix and try again.')
    setUploading(false)
    return  // stop; already-uploaded docs in newDocIds are persisted; modal stays open
  }
  const { documentId } = await res.json()
  newDocIds.push(documentId)
  setUploadedDocIds([...newDocIds])  // track progress so retry skips succeeded files
}

// All uploads succeeded — trigger generation
const body: Record<string, unknown> = { studySetId: studySet.id, mode }
if (mode === 'append') body.documentIds = newDocIds

await fetch('/api/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

onStatusChange(studySet.id, 'processing')
onClose()
```

On partial failure: `uploadedDocIds` records how many succeeded. On next Confirm press, `remainingFiles` is the slice starting after the last successful upload, so already-uploaded files are not re-uploaded (no duplicate rows).

---

## Dashboard Page (`app/dashboard/page.tsx`)

```typescript
const [addDocTarget, setAddDocTarget] = useState<StudySet | null>(null)
const { studySets, subjects, ..., updateSetStatus } = useStudySets()
```

Pass to `SubjectGroup`:
```tsx
onAddDocument={(id) => {
  const set = studySets.find(s => s.id === id)
  if (set) setAddDocTarget(set)
}}
```

Render:
```tsx
{addDocTarget && (
  <AddDocumentModal
    studySet={addDocTarget}
    onClose={() => setAddDocTarget(null)}
    onStatusChange={updateSetStatus}
  />
)}
```

---

## Status API (`app/api/generate/status/[id]/route.ts`)

No changes required.

---

## Error Handling

| Scenario | Behaviour |
|----------|-----------|
| First file upload fails (create flow) | Error on upload page; no `study_sets` row created |
| Subsequent file upload fails (create flow) | Error on upload page; `study_sets` exists; retry via "Add Document" |
| Generate fails (upload page, user still watching) | Error shown on upload page |
| Generate fails (upload page, user already left) | `generation_status: 'error'`; card shows "Retry" on dashboard |
| Upload fails in modal | Error in modal; modal stays open; successful uploads tracked; retry skips already-uploaded files |
| Generation fails (triggered from modal) | `generation_status: 'error'`; "Retry" calls `refreshSet(id)` |
| Set has no documents rows after migration | Generate returns 500 `{ error: 'No documents found for this study set' }` |

---

## Out of Scope

- Removing individual documents from a set after upload.
- Per-document question attribution.
- Streaming generation progress (SSE/WebSocket).
- Reordering documents within a set.
- Eliminating the existing N+1 question-count queries in `useStudySets.fetch()` — this pre-exists and is not addressed here.
- Auditing `app/study/[id]/page.tsx` for nullable `file_type` — that page does not display `file_type` directly, but should be checked for TypeScript errors after the `StudySet` type change.
