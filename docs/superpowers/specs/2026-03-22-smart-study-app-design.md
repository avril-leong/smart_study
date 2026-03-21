# Smart Study App — Design Specification

**Date:** 2026-03-22
**Status:** Approved

---

## Overview

A web-hosted, AI-driven adaptive study application for individual use by a small group of friends. Users upload study materials and the app converts them into an interactive retrieval-practice experience: adaptive quizzes, spaced repetition, weakness targeting, and Socratic feedback. Styled after Kahoot's bold gamified energy and thea.study's academic clarity.

---

## Goals

- Convert static study materials into interactive question-and-answer sessions
- Personalise difficulty and topic focus per user based on performance history
- Host online for free, accessible from anywhere
- Keep AI API costs low through a generate-once, minimal-token strategy
- Produce clean, modular, reusable code throughout

---

## Non-Goals (v1)

- Collaborative/group study sessions (individual only)
- Video file input
- Mobile-native app (responsive web only)
- Paid features or subscriptions
- Matching question type (deferred to v2 — grading and UX complexity not worth v1 scope)

---

## Tech Stack

| Layer | Technology | Hosting |
|---|---|---|
| Frontend + API routes | Next.js 14 (App Router) | Vercel (free) |
| Database | Supabase PostgreSQL | Supabase (free tier) |
| File storage | Supabase Storage | Supabase (free tier) |
| Auth | Supabase Auth | Supabase (free tier) |
| AI | DeepSeek API | Pay-per-use |

**Constraints:**
- Vercel Hobby (free) serverless function timeout: 60s. The `POST /api/generate` route is synchronous — it stays open while DeepSeek responds. To reliably stay under 60s, extracted text sent to DeepSeek is capped at **15,000 characters** before chunking. Documents longer than this will have their text truncated. This is a known v1 limitation; larger document support requires upgrading to Vercel Pro or adding a background job queue.
- Supabase free tier: 500MB database, 1GB storage, 50MB per file
- All file parsing runs server-side in Next.js API routes
- Extracted text is stored as a `.txt` sidecar file in Supabase Storage (not as a DB column) to preserve the 500MB database budget

---

## Supported Input Formats

| Format | Parser Library |
|---|---|
| PDF | `pdf-parse` |
| Plain text (.txt) | Native Node.js |
| Word documents (.docx) | `officeparser` |
| PowerPoint (.pptx) | `officeparser` |
| Markdown (.md) | `marked` (strip HTML to plain text) |

> `officeparser` is used for DOCX and PPTX — it is actively maintained, handles both formats with a single dependency, and is stable on Node.js LTS.

---

## Database Schema

### `subjects`
```sql
id           uuid PRIMARY KEY DEFAULT gen_random_uuid()
user_id      uuid REFERENCES auth.users NOT NULL
name         text NOT NULL
color        text NOT NULL DEFAULT '#00c9ff'
created_at   timestamptz DEFAULT now()
```

### `study_sets`
```sql
id                   uuid PRIMARY KEY DEFAULT gen_random_uuid()
user_id              uuid REFERENCES auth.users NOT NULL
subject_id           uuid REFERENCES subjects(id) ON DELETE SET NULL
name                 text NOT NULL
file_name            text NOT NULL
file_type            text NOT NULL
extracted_text_path  text NOT NULL   -- Supabase Storage path to .txt sidecar file
generation_status    text NOT NULL DEFAULT 'pending'
                     CHECK (generation_status IN ('pending', 'processing', 'done', 'error'))
last_studied_at      timestamptz     -- updated on every answer_log insert for this set's questions
created_at           timestamptz DEFAULT now()
updated_at           timestamptz DEFAULT now()
                     -- updated_at is kept current via a moddatetime trigger (Supabase built-in extension)
```

> `extracted_text` is stored as a `.txt` file in Supabase Storage and referenced by `extracted_text_path`. This avoids inflating the PostgreSQL database with large text blobs.
>
> `generation_status` is used by the client to poll generation progress (see Async Generation Pattern).
>
> `question_count` is **not** stored as a column. Use `SELECT COUNT(*) FROM questions WHERE study_set_id = $1` at query time to avoid denormalisation drift.

### `questions`
```sql
id             uuid PRIMARY KEY DEFAULT gen_random_uuid()
study_set_id   uuid REFERENCES study_sets(id) ON DELETE CASCADE NOT NULL
type           text NOT NULL CHECK (type IN ('mcq', 'short_answer'))
question_text  text NOT NULL
options        jsonb         -- MCQ only: [{label: 'A'|'B'|'C'|'D', text: string}]
correct_answer text NOT NULL -- MCQ: option label ('A'/'B'/'C'/'D'); short_answer: canonical answer string
created_at     timestamptz DEFAULT now()
```

### `question_state` (current SM-2 state per user per question)
```sql
user_id       uuid REFERENCES auth.users NOT NULL
question_id   uuid REFERENCES questions(id) ON DELETE CASCADE NOT NULL
ease_factor   float NOT NULL DEFAULT 2.5
interval      int NOT NULL DEFAULT 1       -- days until next review
repetitions   int NOT NULL DEFAULT 0
next_review   timestamptz NOT NULL DEFAULT now()
updated_at    timestamptz NOT NULL DEFAULT now()

PRIMARY KEY (user_id, question_id)
```

> `updated_at` on `question_state` is managed manually: every upsert explicitly sets `updated_at = now()`. No moddatetime trigger is added to this table.

> This table holds only the **current SM-2 state** for a user-question pair. It is upserted on every answer using `ON CONFLICT (user_id, question_id) DO UPDATE`.

### `answer_log` (append-only history)
```sql
id            uuid PRIMARY KEY DEFAULT gen_random_uuid()
user_id       uuid REFERENCES auth.users NOT NULL
question_id   uuid REFERENCES questions(id) ON DELETE CASCADE NOT NULL
answer_given  text NOT NULL
is_correct    boolean NOT NULL
answered_at   timestamptz DEFAULT now()
```

> Kept separate from `question_state` so SM-2 state is always a single authoritative row, while full answer history is preserved for analytics/weak topic reporting.

---

## Row Level Security (RLS)

All user-owned tables have RLS enabled. The base policy for each table is:

```sql
-- Enable RLS
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE answer_log ENABLE ROW LEVEL SECURITY;

-- subjects: owned by user
CREATE POLICY "user owns subjects" ON subjects
  USING (user_id = auth.uid());

-- study_sets: owned by user
CREATE POLICY "user owns study_sets" ON study_sets
  USING (user_id = auth.uid());

-- questions: accessible if the parent study_set belongs to the user
CREATE POLICY "user accesses own questions" ON questions
  USING (
    study_set_id IN (
      SELECT id FROM study_sets WHERE user_id = auth.uid()
    )
  );

-- question_state: owned by user
CREATE POLICY "user owns question_state" ON question_state
  USING (user_id = auth.uid());

-- answer_log: owned by user
CREATE POLICY "user owns answer_log" ON answer_log
  USING (user_id = auth.uid());
```

> API routes use the **Supabase service role key** (server-only, never exposed to the client) for inserts that require bypassing RLS (e.g. inserting questions after generation). Client-side queries use the **anon key** with RLS enforced.

---

## Architecture

```
smart_study/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── register/page.tsx
│   ├── dashboard/page.tsx              # Study sets grouped by subject
│   ├── upload/page.tsx                 # File upload + study set creation
│   ├── study/[id]/page.tsx             # Active study session
│   ├── study/[id]/complete/page.tsx    # Session complete summary
│   └── settings/page.tsx              # Subject management, account
│   └── api/
│       ├── upload/route.ts             # Parse file → store text sidecar → create study_set row
│       ├── generate/route.ts           # DeepSeek: generate questions (async, updates generation_status)
│       ├── generate/status/[id]/route.ts  # Client polls this for generation_status
│       ├── session/
│       │   ├── next/route.ts           # SM-2: select next question
│       │   └── answer/route.ts         # Record answer, upsert SM-2 state
│       └── feedback/route.ts           # DeepSeek: Socratic feedback (minimal tokens)
├── lib/
│   ├── parsers/
│   │   ├── index.ts                    # Dispatcher: picks parser by file type
│   │   ├── pdf.ts
│   │   ├── docx.ts                     # uses officeparser
│   │   ├── pptx.ts                     # uses officeparser
│   │   ├── markdown.ts
│   │   └── txt.ts
│   ├── ai/
│   │   ├── generate-questions.ts       # Bulk question generation prompt + DeepSeek call
│   │   ├── get-feedback.ts             # Per-answer Socratic feedback call
│   │   └── chunk-text.ts              # Split large docs within token budget
│   ├── spaced-repetition/
│   │   └── sm2.ts                     # Pure SM-2 algorithm, no dependencies
│   └── supabase/
│       ├── client.ts                  # Browser client (anon key, RLS enforced)
│       └── server.ts                  # Server client (service role key, RLS bypassed)
├── hooks/
│   ├── useStudySession.ts             # Session state: current Q, score, history
│   └── useStudySets.ts                # Fetch + mutate study sets
├── components/
│   ├── ui/                            # Primitives: Button, Card, Badge, ProgressBar,
│   │                                  #   Modal, Input, Spinner, ProgressRing
│   ├── study/
│   │   ├── QuestionCard.tsx
│   │   ├── AnswerButton.tsx
│   │   ├── FeedbackPanel.tsx
│   │   ├── SessionProgress.tsx
│   │   └── SessionComplete.tsx
│   ├── dashboard/
│   │   ├── SubjectGroup.tsx
│   │   ├── StudySetCard.tsx
│   │   └── RenameInput.tsx
│   └── upload/
│       ├── DropZone.tsx
│       └── SubjectSelector.tsx
└── types/
    └── index.ts                       # Shared TypeScript types for all layers
```

---

## Token Efficiency Strategy

### Generation pattern
The upload and generation steps are **decoupled** into two API calls for clarity and separation of concerns:

1. `POST /api/upload` — parses the file, stores the `.txt` sidecar in Storage, creates the `study_sets` row with `generation_status = 'pending'`, then immediately returns `{ studySetId }`.
2. `POST /api/generate` — called immediately after by the client. The client **awaits** this call synchronously. The route sets `generation_status = 'processing'`, calls DeepSeek, inserts questions, sets `generation_status = 'done'` (or `'error'`), and returns `{ ok: true }`. Input is capped at 15,000 characters to stay within the 60s limit.
3. While awaiting step 2, the upload page shows a loading state. The client may optionally poll `GET /api/generate/status/[id]` every 3s to animate a progress indicator, but the primary completion signal is the `POST /api/generate` response itself.

Once `POST /api/generate` resolves, the client redirects to the dashboard.

### Generate-once pattern
DeepSeek is called **once per study set** at upload time to produce the full question bank (20–40 questions). Questions are stored in the `questions` table. No generation calls occur during study sessions.

### Document chunking
Large documents are split into chunks of ~3,000 tokens each via `chunk-text.ts`. Each chunk is sent in sequence to DeepSeek and questions are merged before bulk insertion.

### Minimal feedback calls
Socratic feedback sends only:
```
Question: <question_text>
Correct answer: <correct_answer>
User's answer: <answer_given>
Was correct: <true/false>
```
Approximately 80–150 tokens per call, regardless of document size.

### No redundant regeneration
If `generation_status = 'done'` for a study set, generation is skipped unless the user explicitly requests a refresh.

---

## API Route Specifications

**All API routes validate the caller's session first:**
```typescript
const { data: { user }, error } = await supabase.auth.getUser()
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
```
`userId` is always derived from the verified session — never from request params or body.

### `POST /api/upload`
**Auth:** Required
**Request:** `multipart/form-data` — `file`, `name` (string), `subjectId` (optional uuid)
**Response:** `{ studySetId: string }`
**Logic:**
1. Validate file type and size (<50MB)
2. Parse text via `lib/parsers/index.ts`; truncate to 15,000 characters
3. Upload `.txt` sidecar to Supabase Storage at `{user.id}/{studySetId}.txt`
4. Insert `study_sets` row with `generation_status = 'pending'`
5. Return `studySetId`

### `POST /api/generate`
**Auth:** Required. Verify `study_sets.user_id = user.id` before proceeding; return 403 if not.
**Request:** `{ studySetId: string }`
**Response:** `{ ok: true }` when complete (synchronous — client polls `/api/generate/status/[id]`)
**Logic:**
1. Verify ownership of `studySetId`
2. Fetch and download `.txt` sidecar from Storage
3. Set `generation_status = 'processing'`
4. Chunk text → call DeepSeek → parse JSON question array
5. Bulk insert into `questions`
6. Set `generation_status = 'done'` (or `'error'` on failure)

> **Known v1 constraint:** This is a synchronous route. Input is capped at 15,000 characters to stay within Vercel's 60s timeout. The client starts polling `/api/generate/status/[id]` immediately after calling this endpoint.

### `GET /api/generate/status/[id]`
**Auth:** Required. Returns 403 if study set does not belong to session user.
**Response:** `{ status: 'pending' | 'processing' | 'done' | 'error', questionCount: number }`
`questionCount` is `SELECT COUNT(*) FROM questions WHERE study_set_id = $id`; returns `0` before any questions have been inserted.

### `GET /api/session/next`
**Auth:** Required. `userId` is extracted from session — not from query params.
**Request query params:** `studySetId` only
**Response:** `{ question: Question } | { done: true }`
**Logic (SQL priority order):**
```sql
-- 1. Questions due for review
SELECT q.* FROM questions q
JOIN question_state qs ON qs.question_id = q.id AND qs.user_id = $userId
WHERE q.study_set_id = $studySetId AND qs.next_review <= now()
ORDER BY qs.next_review ASC LIMIT 1

-- 2. Questions never attempted (no row in question_state)
SELECT q.* FROM questions q
LEFT JOIN question_state qs ON qs.question_id = q.id AND qs.user_id = $userId
WHERE q.study_set_id = $studySetId AND qs.question_id IS NULL
LIMIT 1

-- 3. Weakness targeting (lowest ease_factor)
SELECT q.* FROM questions q
JOIN question_state qs ON qs.question_id = q.id AND qs.user_id = $userId
WHERE q.study_set_id = $studySetId
ORDER BY qs.ease_factor ASC LIMIT 1
```
Returns `{ done: true }` if all three queries return no rows.

### `POST /api/session/answer`
**Auth:** Required. `userId` derived from session.
**Request:** `{ questionId, answerGiven, isCorrect, smQuality: 0–5 }`
**Response:** `{ updated: true }`
**Logic:**
1. For MCQ questions: re-validate `isCorrect` server-side by fetching `questions.correct_answer` and comparing against `answerGiven`. Override caller-supplied `isCorrect` if mismatched. For short-answer questions, `isCorrect` is accepted as supplied (client-side grading is trusted — this is a friends-only private app).
2. Append row to `answer_log`
3. Compute new SM-2 state via `sm2.updateSM2(smQuality, ...currentState)`
4. Upsert into `question_state`
5. Update `study_sets.last_studied_at = now()` for the parent study set of `questionId`:
```sql
INSERT INTO question_state (user_id, question_id, ease_factor, interval, repetitions, next_review, updated_at)
VALUES ($userId, $questionId, $easeFactor, $interval, $repetitions, $nextReview, now())
ON CONFLICT (user_id, question_id) DO UPDATE
SET ease_factor = EXCLUDED.ease_factor,
    interval = EXCLUDED.interval,
    repetitions = EXCLUDED.repetitions,
    next_review = EXCLUDED.next_review,
    updated_at = now()
```

### `POST /api/feedback`
**Auth:** Required.
**Request:** `{ questionText, correctAnswer, answerGiven, isCorrect }`
**Response:** `{ feedback: string }`

---

## Short-Answer Grading Strategy

Short-answer correctness is evaluated **client-side** before submission using normalised string matching:

```typescript
function gradeShortAnswer(given: string, correct: string): boolean {
  const normalise = (s: string) =>
    s.toLowerCase().trim().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ')
  return normalise(given) === normalise(correct)
}
```

- Strips punctuation and normalises whitespace/case
- The `correct_answer` field for short-answer questions stores a canonical answer string generated by DeepSeek at question-generation time
- If the normalised match fails, the answer is marked incorrect. No additional AI call is made for grading — only for Socratic feedback (always shown regardless of correctness)

> **Known limitation:** Phrasing variations, synonyms, or partial-correct answers will be marked wrong. To maximise match rate, the question generation prompt explicitly instructs DeepSeek to produce **terse, single-word or short-phrase canonical answers** for short-answer questions (see DeepSeek Prompt Contract below).

---

## DeepSeek Prompt Contract

### Question generation

**System prompt:**
```
You are a study assistant that generates quiz questions from educational text.
Always respond with valid JSON only — no explanation, no markdown, no code fences.
```

**User prompt:**
```
Generate {n} quiz questions from the text below.
Return a JSON array where each object has:
  - "type": "mcq" or "short_answer"
  - "question_text": string
  - "options": array of {label, text} for MCQ (labels "A","B","C","D"), null for short_answer
  - "correct_answer": for MCQ, the label ("A","B","C","D");
                      for short_answer, a single word or short phrase (max 5 words) for exact matching

Distribute types: 70% mcq, 30% short_answer.
For short_answer, correct_answer MUST be terse (1–5 words) to enable exact string matching.

Text:
{chunk}
```

**Expected response shape:**
```json
[
  {
    "type": "mcq",
    "question_text": "What is the powerhouse of the cell?",
    "options": [
      { "label": "A", "text": "Nucleus" },
      { "label": "B", "text": "Mitochondria" },
      { "label": "C", "text": "Ribosome" },
      { "label": "D", "text": "Golgi apparatus" }
    ],
    "correct_answer": "B"
  },
  {
    "type": "short_answer",
    "question_text": "What organelle produces ATP?",
    "options": null,
    "correct_answer": "mitochondria"
  }
]
```

**Parsing failure handling:** If DeepSeek returns malformed JSON, retry once. If the second attempt also fails, set `generation_status = 'error'` and surface the error to the user with a "Try again" button.

---

### Socratic feedback

**System prompt:**
```
You are a supportive study tutor. Respond with plain text only — no markdown, no bullet points.
```

**User prompt:**
```
A student answered a study question.
Question: {question_text}
Correct answer: {correct_answer}
Student's answer: {answer_given}
Result: {correct/incorrect}

In 2-3 sentences, explain why the correct answer is right. If the student was wrong,
address their specific misconception without being discouraging.
```

---

## SM-2 Spaced Repetition Algorithm

The `sm2.ts` module is a pure function — no framework dependencies:

```typescript
interface SM2Input {
  quality: 0 | 1 | 2 | 3 | 4 | 5  // 0-2 = fail, 3-5 = pass
  easeFactor: number                 // default 2.5
  interval: number                   // days, default 1
  repetitions: number                // default 0
}

interface SM2Result {
  easeFactor: number
  interval: number
  repetitions: number
  nextReview: Date
}

function updateSM2(input: SM2Input): SM2Result
```

**SM-2 quality mapping:**
- MCQ correct on first try → quality 5
- Short answer correct → quality 4 (short-answer questions allow only **one submission attempt** — no retry)
- Incorrect → quality 1

---

## Study Session Flow

```
1. User opens /study/[id]
   └── GET /api/session/next?studySetId= → first question (userId from session)

2. Display QuestionCard
   ├── MCQ: 4 labeled answer buttons (A/B/C/D, colour-coded)
   └── Short answer: text input + Submit button

3. User submits answer
   ├── Grade answer (MCQ: compare label; short_answer: normalised string match)
   ├── Visual feedback: correct (green pulse) / wrong (red shake)
   ├── POST /api/session/answer → upsert SM-2 state + append answer_log
   └── POST /api/feedback → fetch Socratic explanation

4. FeedbackPanel slides up
   └── AI explanation displayed → "Next Question" button

5. "Next Question" → GET /api/session/next → repeat from step 2
   └── If { done: true } → redirect to /study/[id]/complete?score=X&total=Y&weakIds=id1,id2,...

6. Session Complete screen
   └── Score, mastery %, weak topics derived from query params + client-side fetch
```

### Session Complete data handoff
The `/study/[id]/complete` page receives state via query parameters:
- `score` — number of correct answers
- `total` — total questions answered
- `weakIds` — comma-separated question IDs (capped at **5** weakest by ease_factor) with ease_factor < 2.0

The page fetches question text for `weakIds` client-side to display weak topic labels. Capping at 5 IDs keeps the URL under ~200 characters for this parameter. The fetch uses the Supabase browser client (anon key, RLS enforced), so only questions belonging to the authenticated user's own study sets will be returned — RLS is the sole guard and no additional ID validation is required.

---

## User Features

### Study Set Management
- **Rename:** Inline click-to-edit on the study set name in the dashboard
- **Categorise:** Assign to a subject on upload or via dropdown on the card
- **Delete:** Confirmation modal before deletion (cascades to questions, question_state, answer_log)
- **Refresh questions:** Button to re-trigger generation (resets generation_status to 'pending')

### Subject Management (Settings page)
- Create subjects with a name and colour picker
- Rename or delete subjects
- Deleting a subject moves its study sets to "Uncategorised" (subject_id SET NULL)

### Dashboard
- Study sets grouped by subject in collapsible sections
- Each card shows: name, file type badge, question count (live COUNT query), last studied date, mastery progress ring
- "Uncategorised" group at the bottom for unassigned sets
- "New Study Set" button top-right

---

## UI Design

### Aesthetic: "Academic Arcade"
Dark-mode interface combining Kahoot's bold gamified energy with thea.study's structured academic clarity.

### Design Tokens
```css
--bg-base:       #080d1a;   /* deep midnight */
--bg-surface:    #111827;   /* card backgrounds */
--bg-border:     #1e293b;   /* dividers */
--accent-cyan:   #00c9ff;   /* primary accent */
--accent-amber:  #f59e0b;   /* secondary accent */
--success:       #10b981;
--error:         #f43f5e;
--text-primary:  #f1f5f9;
--text-muted:    #64748b;

/* Answer button colours (Kahoot-style) */
--answer-a:      #00c9ff;   /* cyan */
--answer-b:      #f59e0b;   /* amber */
--answer-c:      #a78bfa;   /* violet */
--answer-d:      #f43f5e;   /* coral */

/* Typography */
--font-display:  'Syne', sans-serif;               /* bold, geometric, editorial */
--font-body:     'Plus Jakarta Sans', sans-serif;  /* clean, readable, warm */
```

### Key Animations
- Question card: slides in from right on advance
- Answer buttons: scale on hover, pulse on confirm
- Feedback panel: smooth slide-up from bottom
- Progress bar: smooth CSS ease fill
- Dashboard mastery rings: SVG draw-in animation on load
- Upload: pulsing skeleton + polling status while generating questions

### Screen Inventory
| Screen | Route | Description |
|---|---|---|
| Login / Register | `/login`, `/register` | Centered card, animated mesh-gradient BG |
| Dashboard | `/dashboard` | Subjects + study set cards, mastery rings |
| Upload | `/upload` | Drag-and-drop zone, subject selector, generation progress polling |
| Study Session | `/study/[id]` | Question card, answer buttons, feedback panel, progress |
| Session Complete | `/study/[id]/complete` | Score reveal, weak topics (from query params), CTAs |
| Settings | `/settings` | Subject management, account info |

---

## Error Handling

| Scenario | Handling |
|---|---|
| File too large (>50MB) | Client-side validation before upload |
| Unsupported file type | Blocked at DropZone with clear error message |
| DeepSeek API failure during generation | Set `generation_status = 'error'`; client shows "Generation failed — try again" |
| Parsing produces empty text | Return 400 from `/api/upload` with message: "Could not extract text from this file" |
| Session with no due questions | `{ done: true }` from `/api/session/next`; show "All caught up!" with next review countdown |
| Generation polling timeout (>2 min) | Client stops polling, shows "This is taking longer than expected — refresh to check" |

---

## Testing Strategy

- **Unit tests:** `sm2.ts` (pure function), `gradeShortAnswer` (pure function), parser output shapes
- **Integration tests:** API routes with mock Supabase client
- **E2E (optional):** Playwright for upload → generation polling → study session flow

---

## Deployment

1. Push to GitHub
2. Connect repo to Vercel → auto-deploy on push to `main`
3. Set environment variables in Vercel:
   - `NEXT_PUBLIC_SUPABASE_URL` — public, safe to expose
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — public, safe to expose (RLS enforced)
   - `SUPABASE_SERVICE_ROLE_KEY` — **server-only, never prefix with `NEXT_PUBLIC_`**
   - `DEEPSEEK_API_KEY` — **server-only, never prefix with `NEXT_PUBLIC_`**
4. Run Supabase migrations via Supabase CLI (`supabase db push`). Migrations include:
   - All table + RLS policy definitions above
   - Enable `moddatetime` extension and attach trigger to `study_sets.updated_at`:
     ```sql
     CREATE EXTENSION IF NOT EXISTS moddatetime;
     CREATE TRIGGER handle_updated_at BEFORE UPDATE ON study_sets
       FOR EACH ROW EXECUTE PROCEDURE moddatetime(updated_at);
     ```
5. Create Supabase Storage bucket named `study-files` (private). Add RLS policy:
   ```sql
   CREATE POLICY "users access own files" ON storage.objects
     FOR ALL USING (
       bucket_id = 'study-files'
       AND auth.uid()::text = (storage.foldername(name))[1]
     );
   ```

> **Security note:** `SUPABASE_SERVICE_ROLE_KEY` and `DEEPSEEK_API_KEY` must **never** be prefixed with `NEXT_PUBLIC_`. They are only used in `app/api/` server routes via `lib/supabase/server.ts`.

---

## Out of Scope for v1

- Matching question type (deferred to v2)
- Email notifications for spaced repetition reminders
- Sharing study sets between users
- Dark/light mode toggle (dark only)
- Offline support / PWA
