# Presigned Upload Architecture Design

## Problem

Vercel serverless functions have a hard 4.5 MB request body limit. The current `/api/upload` route receives the raw file as `FormData`, making it impossible to upload PDFs larger than ~4 MB. The fix is to bypass Vercel entirely for the file transfer by uploading directly to Supabase Storage via a presigned URL.

## Goal

Replace the single-step upload route with a 3-step flow: sign → direct upload → process. The file never passes through Vercel. All file sizes up to the app's 50 MB limit are supported.

## Supported File Types and Extension Mapping

The following file types are accepted. This allowlist is used in both `/sign` (validation) and `/process` (extension-to-fileType derivation). It matches `lib/parsers/index.ts` `SUPPORTED_TYPES`:

| `fileType` | `ext` |
|---|---|
| `application/pdf` | `pdf` |
| `text/plain` | `txt` |
| `text/markdown` | `md` |
| `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | `docx` |
| `application/vnd.openxmlformats-officedocument.presentationml.presentation` | `pptx` |

Any `fileType` not in this table is rejected with 400.

## Infrastructure Prerequisites

Before deploying, configure the `study-files` Supabase Storage bucket:
1. **CORS**: Allow `PUT` from all app origins (production URL, any preview URLs, and `http://localhost:3000` for local dev). Use a wildcard during development; restrict to exact origins for production.
2. **Max upload size**: Set a 50 MB (52428800 bytes) per-file upload size limit. This enforces the size cap at the storage layer regardless of what `fileSize` the client declared in `/sign`.

These are one-time bucket configuration changes — not code changes.

---

## Architecture

### Step 1 — Sign (`POST /api/upload/sign`)

`export const maxDuration = 10`

**Input (JSON):**
```json
{
  "fileType": "application/pdf",
  "fileSize": 4200000,
  "studySetId": "optional — omit for new study set",
  "name": "optional — required if new study set, max 200 chars",
  "subjectId": "optional",
  "customPrompt": "optional, max 500 chars"
}
```

**Server logic:**
1. Verify auth (return 401 if not logged in)
2. Validate `fileType` is in the supported types table above (return 400 if not)
3. Validate `fileSize`: must be a positive integer ≤ 52428800 (50 MB). Return 400 if missing or out of range.
4. If `studySetId` provided: validate it is a valid UUID v4, then verify the study set exists and `user_id = userId` (return 403 if not)
5. If `studySetId` omitted (new study set): validate `name` is present, non-empty, and ≤ 200 chars (return 400 if invalid). Name sanitization (trim) is deferred to `/process` since `/sign` writes nothing to the DB.
6. If `customPrompt` provided: validate ≤ 500 chars (return 400 if over limit). No sanitization here — `/sign` writes nothing to DB; sanitization happens in `/process` where the value is persisted.
7. Generate `studySetId` (if new) and `documentId` as UUIDs (`crypto.randomUUID()`)
8. Build `rawStoragePath`: `{userId}/{studySetId}/raw/{documentId}.{ext}` where `ext` comes from the extension mapping table above
9. Call `service.storage.from('study-files').createSignedUploadUrl(rawStoragePath, { expiresIn: 300 })` (5-minute expiry)
10. Return `{ signedUrl, token, studySetId, documentId, rawStoragePath }`

> **Note on TOCTOU:** When `studySetId` is omitted, the server generates a fresh UUID and returns it to the client. The client passes this UUID back in `/process`. This is acceptable because the path prefix check in `/process` step 2 ensures any UUID the client submits will only ever create a study set under that client's own `userId` — there is no cross-user risk.

**Output (JSON):**
```json
{
  "signedUrl": "https://...",
  "token": "...",
  "studySetId": "uuid",
  "documentId": "uuid",
  "rawStoragePath": "userId/studySetId/raw/documentId.pdf"
}
```

`token` is the Supabase signed upload token. The client does not need to pass it separately — `signedUrl` already embeds it. It is returned for completeness.

No DB records are created here. No file is transferred.

---

### Step 2 — Direct upload (client-side, no Vercel involvement)

Client executes:
```js
const res = await fetch(signedUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })
if (!res.ok) throw new Error('Storage upload failed')
```

This goes directly from the browser to Supabase Storage. If this fails, the client shows an error and does not call `/process`.

---

### Step 3 — Process (`POST /api/upload/process`)

`export const maxDuration = 60`

**Input (JSON):**
```json
{
  "rawStoragePath": "userId/studySetId/raw/documentId.pdf",
  "fileName": "chapter1.pdf",
  "fileType": "application/pdf",
  "studySetId": "uuid",
  "documentId": "uuid",
  "isNewStudySet": true,
  "name": "Chapter 1 Notes",
  "subjectId": "optional uuid or null",
  "customPrompt": "optional string or null"
}
```

**Server logic:**
1. Verify auth (return 401 if not logged in)
2. Split `rawStoragePath` by `/` into segments. Validate `segments[0] === userId` (strict equality). Return 403 if not. This prevents a user from processing another user's uploaded file.
3. Validate the full `rawStoragePath` against the anchored regex `^{uuidV4}/{uuidV4}/raw/{uuidV4}\.(pdf|txt|md|docx|pptx)$` where `{uuidV4}` = `[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}`. The match must cover the entire string (use `^...$` anchors). Return 400 if malformed. After this check, `segments` = `[userId, studySetId, 'raw', 'documentId.ext']` (indices 0–3).
4. Cross-check: verify `studySetId` body field === `segments[1]`, and `documentId` body field === `segments[3].split('.')[0]` (strip extension by splitting on `.` and taking index 0 — safe because the regex in step 3 already enforces a single-extension filename). Return 400 if either does not match. This prevents a client from mixing path and body fields from different sign requests.
5. Derive `fileType` from the path extension using the extension mapping table. Validate client-supplied `fileType` matches the derived value — return 400 if mismatch. Use the derived value (not the client value) for `parseFile` and for DB insert.
6. Validate `fileName` is present and ≤ 255 chars (return 400 if invalid). Sanitize: `fileName = fileName.trim()`.
7. If `subjectId` provided and non-null: validate it is a valid UUID v4 (return 400 if not).
8. If `customPrompt` provided: validate ≤ 500 chars (return 400). Sanitize using `sanitizePrompt` from `lib/sanitize.ts`.
9. `isNewStudySet` is advisory. The authoritative check is the DB state in steps 10–11.
10. If `isNewStudySet`:
   - Validate `name` is present, non-empty, and ≤ 200 chars (return 400 if invalid). Sanitize: `name = name.trim()`.
   - Query: check that no `study_sets` row with `id = studySetId` already exists. If it does, return 409 Conflict. (The subsequent insert is the atomic gate; this pre-check provides a clean 409 error message.)
11. If `!isNewStudySet`:
    - Verify the study set with `studySetId` exists and `user_id = userId` (return 403 if not)
12. Download raw file from storage: `service.storage.from('study-files').download(rawStoragePath)`.
    - If Supabase returns a not-found error: return 404 `{ error: 'Uploaded file not found — the signed URL may have expired or the upload did not complete' }`
    - Any other storage error: return 500 `{ error: 'Failed to download uploaded file' }`
13. Parse the file buffer into text using `parseFile(buffer, derivedFileType)`. If `parseFile` throws or returns empty/null: delete raw file (best-effort), return 422 `{ error: 'Failed to extract text from file' }` (or use the error message from the parser). Note: `parseFile` handles malformed or mistyped content (e.g., a PNG uploaded to a `.pdf` path) by throwing — it does not hang or crash the process. The 422 path is the expected outcome for such uploads.
14. Build `textStoragePath`: `{userId}/{studySetId}/{documentId}.txt`
15. Upload extracted text to storage at `textStoragePath`. If this fails: delete raw file (best-effort), return 500 `{ error: 'Failed to save extracted text' }`
16. If `isNewStudySet`: insert into `study_sets` with `{ id: studySetId, user_id: userId, name, subject_id: subjectId ?? null, custom_prompt: customPrompt ?? null, generation_status: 'pending', file_name: null, file_type: null, extracted_text_path: null }`. Note: `file_name`, `file_type`, and `extracted_text_path` on `study_sets` are legacy columns from the old single-document model. The generation route reads `extracted_text_path` from `study_set_documents`, not from `study_sets`, so inserting null here is correct and will not break generation.
    - If this fails due to a unique constraint violation on `id`: a concurrent request already created the row — return 409 Conflict.
    - Any other failure: delete raw file and text file (best-effort), return 500.
17. Insert into `study_set_documents` with `{ id: documentId, study_set_id: studySetId, file_name: fileName, file_type: derivedFileType, extracted_text_path: textStoragePath }`.
    - If this fails due to a unique constraint violation on `documentId`: run a single query joining `study_set_documents` and `study_sets` to verify the existing row has `study_set_documents.id = documentId AND study_sets.id = studySetId AND study_sets.user_id = userId`. If ownership matches: return 200 `{ studySetId, documentId }` (idempotent retry). If ownership does not match: return 409 Conflict.
    - If this fails for any other reason: if `isNewStudySet` was true, also delete the `study_sets` row just inserted (best-effort). Delete raw and text files. Return 500.
18. Delete raw file from storage: `service.storage.from('study-files').remove([rawStoragePath])` (best-effort — do not fail the request if this delete fails, just log the error)
19. Return `{ studySetId, documentId }`

**Error handling summary:**

| Failure point | Cleanup | HTTP status |
|---|---|---|
| Download fails (not found) | — | 404 |
| Download fails (other) | — | 500 |
| Parse fails | delete raw | 422 |
| Text upload fails | delete raw | 500 |
| `study_sets` unique constraint (concurrent) | — | 409 |
| `study_sets` insert fails (other) | delete raw + text | 500 |
| `study_set_documents` unique constraint | — | 200 (idempotent) |
| `study_set_documents` other insert fails | delete raw + text + `study_sets` row (if new) | 500 |

Cleanup failures (storage deletes) are logged but do not change the HTTP response.

---

## Client-side flow changes

### Upload page (`app/upload/page.tsx`)

Replace the current single `fetch('/api/upload', FormData)` calls with:

**For first file (creates new study set):**
1. `POST /api/upload/sign` `{ fileType: file.type, fileSize: file.size, name, subjectId, customPrompt }` → `{ signedUrl, studySetId, documentId, rawStoragePath }`
2. `PUT signedUrl` with raw file body and `Content-Type: file.type`. Check `res.ok` — non-2xx is an error.
3. `POST /api/upload/process` `{ rawStoragePath, fileName: file.name, fileType: file.type, studySetId, documentId, isNewStudySet: true, name, subjectId, customPrompt }`

**For each additional file (attaches to same study set):**
1. `POST /api/upload/sign` `{ fileType: file.type, fileSize: file.size, studySetId }` → `{ signedUrl, documentId, rawStoragePath }`
2. `PUT signedUrl` with raw file
3. `POST /api/upload/process` `{ rawStoragePath, fileName: file.name, fileType: file.type, studySetId, documentId, isNewStudySet: false }`

After all files processed: call `/api/generate` as before.

Error handling: if any sign/upload/process step fails, show the specific error message returned by the server (or a generic fallback) and stop. Already-processed files (tracked by `documentId`) are not re-uploaded on retry.

### AddDocumentModal (`components/dashboard/AddDocumentModal.tsx`)

Same 3-step pattern per file. `studySetId` is always known (existing set), so `isNewStudySet` is always `false`. The modal does not pass `name` or `subjectId` to `/sign` or `/process`.

---

## Files changed

| File | Action |
|------|--------|
| `app/api/upload/route.ts` | Replace body with `return NextResponse.json({ error: 'Use /api/upload/sign and /api/upload/process' }, { status: 410 })` |
| `app/api/upload/sign/route.ts` | Create new |
| `app/api/upload/process/route.ts` | Create new |
| `app/upload/page.tsx` | Update upload logic to 3-step |
| `components/dashboard/AddDocumentModal.tsx` | Update upload logic to 3-step |

## What does NOT change

- `/api/generate` route — unchanged
- `lib/parsers/` — unchanged, reused in process route
- `lib/sanitize.ts` — unchanged, reused in process route
- Supabase schema — no migrations needed
- Generation flow — unchanged
- UI appearance — unchanged (same spinner, same error messages)

## Out of scope

- Rate limiting on `/sign` and `/process` — not implemented in this iteration. Known gap: `/sign` can be called in a loop to generate unused signed URLs. Acceptable given authenticated-only access.
