# Focus Lesson Content — Design Spec

## Problem

PDFs uploaded by users often contain administrative content mixed with lesson material — deadlines, submission dates, assessment weightings, course schedules, and program structure. The AI currently generates questions from all of this, producing useless questions unrelated to the subject matter.

## Solution

A per-study-set toggle — **"Focus on lesson content only"** — that appends a targeted instruction to the AI system prompt, directing it to skip administrative content and generate questions only from subject matter concepts.

The toggle is opt-in with a disclaimer that AI filtering may not be perfect.

---

## Data Model

### DB migration
```sql
ALTER TABLE study_sets ADD COLUMN IF NOT EXISTS focus_lesson_content boolean DEFAULT false;
```

### TypeScript type (`types/index.ts`)
Add to `StudySet` interface:
```ts
focus_lesson_content?: boolean
```

---

## AI Prompt Change (`lib/ai/generate-questions.ts`)

The system prompt is currently a module-level constant string. It becomes a function that returns a string based on the `focusLessonContent` flag.

**Placement rationale:** The focus instruction is a behavioural constraint on the model — it governs how the model reads and interprets the input, not what input it receives. It therefore belongs in the **system prompt**, not the user message. This is intentionally different from `customPrompt` (which is user-supplied focus guidance and stays in the user message under `Additional focus:`). Hardcoded behavioural constraints go in the system message; user-authored instructions go in the user message.

The focus instruction appended to the system prompt when `focusLessonContent` is `true`:

```
Focus exclusively on subject matter concepts, theories, definitions, and principles.
Skip any content about: deadlines, submission dates, assessment weightings, course schedules,
administrative procedures, contact details, or program structure.
If a passage contains only administrative content, do not generate questions for it — return
fewer questions rather than asking about irrelevant material.
```

**Prompt engineering rationale:**
- Positive framing first ("Focus exclusively on...") before exclusions
- Named, specific categories rather than vague "ignore irrelevant content"
- Clear fallback behaviour ("return fewer questions rather than...")
- No sanitization needed — this is hardcoded application text, not user-supplied input

Note: `generateQuestions` calls `generateFromChunk` exactly once with the full (capped) text. There is no chunking loop. The `focusLessonContent` parameter simply threads through to that single call.

**Important:** The retry recursive call inside `generateFromChunk` must also pass `focusLessonContent`, otherwise retries silently drop the flag. Updated retry call:
```ts
return generateFromChunk(chunk, studySetId, n, aiConfig, customPrompt, focusLessonContent, retries - 1)
```

`generateFromChunk` signature change:
```ts
async function generateFromChunk(
  chunk: string,
  studySetId: string,
  n: number,
  aiConfig: AIConfig,
  customPrompt?: string,
  focusLessonContent?: boolean,
  retries = 1
)
```

`generateQuestions` signature change:
```ts
export async function generateQuestions(
  text: string,
  studySetId: string,
  aiConfig: AIConfig,
  customPrompt?: string,
  questionCount = 25,
  focusLessonContent = false
)
```

---

## Settings API (`app/api/study-sets/[id]/settings/route.ts`)

Accept `focusLessonContent` in the PATCH body. Use `'focusLessonContent' in body` guard (consistent with the `subjectId`/`customPrompt` pattern; `questionCountPref` uses `!== undefined` which also works for a boolean but `'in body'` is preferred here). Validate it is a boolean. Map camelCase → snake_case: `focusLessonContent` → `updates.focus_lesson_content`.

```ts
if ('focusLessonContent' in body) {
  if (typeof body.focusLessonContent !== 'boolean')
    return NextResponse.json({ error: 'focusLessonContent must be a boolean' }, { status: 400 })
  updates.focus_lesson_content = body.focusLessonContent
}
```

---

## Generate API (`app/api/generate/route.ts`)

Add `focus_lesson_content` to the study set select. Full updated select string:

```ts
.select('id, user_id, generation_status, custom_prompt, question_count_pref, focus_lesson_content')
```

Read the value and pass to `generateQuestions`:
```ts
const focusLessonContent = (studySet as { focus_lesson_content?: boolean | null }).focus_lesson_content ?? false
const questions = await generateQuestions(combinedText, studySetId, aiConfig, customPrompt, questionCount, focusLessonContent)
```

**Zero-questions edge case:** If `focusLessonContent` is enabled and the document is entirely administrative, the AI returns an empty array. The existing `if (questions.length > 0)` guard skips the insert. `generation_status` is set to `'done'` with zero questions — the same outcome as today for a document that yields no questions. The dashboard card will show the "0 questions" badge and the Study/History buttons (status is `done`). This is acceptable: "0 questions" with the toggle enabled clearly signals the user to review their content or disable the toggle. No code changes needed for this case.

---

## UI (`components/dashboard/StudySetSettingsModal.tsx`)

Add a toggle below the Custom Instructions section:

- **Label:** "Focus on lesson content only"
- **Disclaimer** (always visible below toggle): *"The AI will attempt to skip administrative content such as deadlines and course schedules. Results may not be perfect."*
- Default state: `false`
- State initialised from `studySet.focus_lesson_content ?? false`
- Included in the Save Changes PATCH payload as `focusLessonContent: boolean`
- The `onSaved` partial update should include `focus_lesson_content: focusLessonContent` for consistency with other fields (the parent already calls `refresh()` which refetches all data, so the partial is not strictly needed but keeps the pattern consistent)
- Takes effect on the next generation only (no auto-regenerate on save)
- Modal close behavior: `save()` calls `onSaved(partial)` which the parent handles by calling `refresh()` and closing the modal via `setSettingsTarget(null)`. The modal itself does not call `onClose()` directly — this matches the existing pattern for the save action.

---

## Files Changed

| File | Change |
|------|--------|
| `types/index.ts` | Add `focus_lesson_content?: boolean` to `StudySet` |
| `lib/ai/generate-questions.ts` | System prompt as function; add `focusLessonContent` param to both functions |
| `app/api/generate/route.ts` | Extend `.select()`, read `focus_lesson_content`, pass to `generateQuestions` |
| `app/api/study-sets/[id]/settings/route.ts` | Accept + validate + save `focusLessonContent` → `focus_lesson_content` |
| `components/dashboard/StudySetSettingsModal.tsx` | Add toggle + disclaimer; include in PATCH payload and `onSaved` partial |

---

## Out of Scope

- Global toggle (feature is per-study-set only)
- Auto-regeneration on toggle save
- Pre-processing text filters or two-pass AI generation
- Surfacing a specific warning when zero questions are generated due to filtering
