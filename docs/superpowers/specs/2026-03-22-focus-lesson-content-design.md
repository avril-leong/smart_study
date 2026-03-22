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

The system prompt becomes a function rather than a constant. When `focusLessonContent` is `true`, the following paragraph is appended:

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
- Appended to system prompt (behavioural instruction), not user message

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

Accept `focusLessonContent: boolean` in the PATCH body. Validate it is a boolean. Save to `study_sets.focus_lesson_content`.

---

## Generate API (`app/api/generate/route.ts`)

Read `focus_lesson_content` from the study set row (add to the `.select()` call). Pass it to `generateQuestions`.

---

## UI (`components/dashboard/StudySetSettingsModal.tsx`)

Add a toggle below the Custom Instructions section:

- **Label:** "Focus on lesson content only"
- **Disclaimer** (always visible below toggle): *"The AI will attempt to skip administrative content such as deadlines and course schedules. Results may not be perfect."*
- Default: `false`
- State initialised from `studySet.focus_lesson_content ?? false`
- Included in the Save Changes PATCH payload as `focusLessonContent`
- Takes effect on the next generation only (no auto-regenerate on save)

---

## Files Changed

| File | Change |
|------|--------|
| `types/index.ts` | Add `focus_lesson_content?: boolean` to `StudySet` |
| `lib/ai/generate-questions.ts` | System prompt as function; add `focusLessonContent` param |
| `app/api/generate/route.ts` | Read `focus_lesson_content`, pass to `generateQuestions` |
| `app/api/study-sets/[id]/settings/route.ts` | Accept + save `focusLessonContent` |
| `components/dashboard/StudySetSettingsModal.tsx` | Add toggle + disclaimer |

---

## Out of Scope

- Global toggle (feature is per-study-set only)
- Auto-regeneration on toggle save
- Pre-processing text filters or two-pass AI generation
