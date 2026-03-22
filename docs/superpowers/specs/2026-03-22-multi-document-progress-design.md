# Multi-Document Study Sets & Generation Progress Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow each study set to contain multiple uploaded documents, and improve the question generation progress UI.

**Architecture:** Add a `study_set_documents` junction table; update upload, generate, and dashboard flows to support multiple files per set. Progress UI uses the existing polling mechanism with improved visuals.

**Tech Stack:** Next.js 14 App Router, Supabase (PostgreSQL + Storage + RLS), TypeScript, Tailwind/CSS variables

---

## Schema

### New table: `study_set_documents`

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
  USING (study_set_id IN (SELECT id FROM study_sets WHERE user_id = auth.uid()));
```

### Migration on `study_sets`

Make existing single-document columns nullable (data preserved, unused going forward):

```sql
ALTER TABLE study_sets ALTER COLUMN file_name DROP NOT NULL;
ALTER TABLE study_sets ALTER COLUMN file_type DROP NOT NULL;
ALTER TABLE study_sets ALTER COLUMN extracted_text_path DROP NOT NULL;
```

### Types update

Add to `types/index.ts`:

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

Update `StudySet` to include `documents?: StudySetDocument[]`.

---

## Upload API (`/api/upload`)

Accept an optional `studySetId` in the form data.

- If `studySetId` is **absent**: generate a new UUID, create a `study_sets` row with `generation_status: 'pending'`, create a `study_set_documents` row.
- If `studySetId` is **present**: skip creating `study_sets`, only create a `study_set_documents` row attached to the existing set.

Both cases: extract text from file, upload `.txt` sidecar to `{userId}/{studySetId}/{documentId}.txt`, insert `study_set_documents` row.

Returns: `{ studySetId, documentId }`.

---

## Generate API (`/api/generate`)

Request body:

```typescript
{
  studySetId: string
  mode?: 'append' | 'regenerate'   // default: 'regenerate'
  documentIds?: string[]            // if provided, only generate from these docs (append mode)
}
```

Behaviour:

1. Verify ownership.
2. If already `'done'` and mode is not `'regenerate'`, skip.
3. If `mode === 'regenerate'`: delete all existing questions for this study set.
4. Set `generation_status` to `'processing'`.
5. Fetch documents:
   - If `documentIds` provided: fetch only those `study_set_documents` rows.
   - Otherwise: fetch all `study_set_documents` for the study set.
6. Download each `.txt` sidecar, concatenate with `\n\n---\n\n` separator.
7. Run `generateQuestions(combinedText, studySetId)`.
8. Bulk-insert questions.
9. Set `generation_status` to `'done'` (or `'error'` on failure).

---

## Upload Page (`/app/upload/page.tsx`)

### Multi-file input

- DropZone accepts multiple files (no change to `DropZone` component props — caller manages the file list).
- Selected files displayed as a list of chips: `filename (size) ✕`.
- Removing a chip removes that file from the pending list.
- Name field auto-fills from the first file if empty (existing behaviour).

### Submit flow

1. Create study set: POST `/api/upload` for the first file (no `studySetId` → creates set).
2. Upload remaining files: POST `/api/upload` for each with the returned `studySetId`.
3. POST `/api/generate` with `{ studySetId, mode: 'regenerate' }`.
4. Poll status and show progress screen (see below).

### Progress screen

Replaces the existing minimal spinner with a centred card:

```
[Spinner]
Generating your questions…
42 questions created so far
This usually takes 1–3 minutes

[Leave — I'll check later]  ← navigates to /dashboard, generation continues
```

The "Leave" button navigates away without cancelling generation (the API call continues server-side).

---

## Dashboard — Add Documents to Existing Set

### Study set card

Add an **"Add Document"** button (secondary style) to each `StudySetCard`.

### Add Document modal

A modal (`components/dashboard/AddDocumentModal.tsx`) with three sections:

1. **Existing documents** — list of `study_set_documents` rows (filename + date). Read-only.
2. **New files** — DropZone (multi-file). Selected files shown as chips.
3. **Mode selector** (shown after at least one file is selected):
   - "Add to existing questions" (`append`)
   - "Delete all questions and regenerate from all documents" (`regenerate`)

On confirm:
1. Upload each new file via POST `/api/upload` with `studySetId`.
2. POST `/api/generate` with `{ studySetId, mode, documentIds }` where `documentIds` is the new doc IDs if `append`, omitted if `regenerate`.
3. Redirect to `/study/{studySetId}` or stay on dashboard with a toast showing status.

---

## Status API (`/api/generate/status/[id]`)

No changes needed — already returns `generation_status` and `questionCount`.

---

## Error Handling

- If any file upload fails mid-batch, show error and allow retry (the study set row already exists; user can add the failed file via "Add Document").
- If generation fails, set `generation_status: 'error'` and show an error message with a "Retry" button (existing behaviour via `refreshSet`).

---

## Out of Scope

- Removing individual documents from a set after upload.
- Per-document question attribution.
- Streaming generation progress (SSE/WebSocket).
