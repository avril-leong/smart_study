# Focus Lesson Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-study-set toggle that instructs the AI to skip administrative PDF content and only generate questions from lesson material.

**Architecture:** A boolean column `focus_lesson_content` on `study_sets` drives a conditional system prompt addition in `lib/ai/generate-questions.ts`. The toggle is saved via the existing settings PATCH endpoint and rendered in `StudySetSettingsModal`.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (Postgres), Vitest (unit tests)

---

## Files

| File | Change |
|------|--------|
| `types/index.ts` | Add `focus_lesson_content?: boolean` to `StudySet` |
| `lib/ai/generate-questions.ts` | `SYSTEM_PROMPT` constant → `buildSystemPrompt(focusLessonContent)` function; thread param through both functions + retry |
| `__tests__/lib/generate-questions.test.ts` | New — unit tests for `buildSystemPrompt` |
| `app/api/generate/route.ts` | Extend `.select()`, read + pass `focus_lesson_content` |
| `app/api/study-sets/[id]/settings/route.ts` | Accept + validate + save `focusLessonContent` |
| `components/dashboard/StudySetSettingsModal.tsx` | Add toggle + disclaimer |

---

## Task 1: DB migration + type

**Files:**
- Modify: `types/index.ts:48` (after `question_count_pref` line)

> **Note:** The SQL migration must be run manually in the Supabase SQL editor (Dashboard → SQL Editor) before or alongside this task. The app will work without it during development (column will just be absent / treated as `false`), but it must be run before deploying.

- [ ] **Step 1: Run the DB migration in Supabase**

Open Supabase Dashboard → SQL Editor and run:

```sql
ALTER TABLE study_sets ADD COLUMN IF NOT EXISTS focus_lesson_content boolean DEFAULT false;
```

Expected: `Success. No rows returned.`

- [ ] **Step 2: Add the field to the TypeScript type**

In `types/index.ts`, after this line:
```ts
  question_count_pref?: number | null // 10 | 25 | 50; NULL = use default (25)
```

Add:
```ts
  focus_lesson_content?: boolean      // filter out administrative/non-lesson content during generation
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add types/index.ts
git commit -m "feat: add focus_lesson_content field to StudySet type"
git push origin main
```

---

## Task 2: AI prompt function + tests

**Files:**
- Modify: `lib/ai/generate-questions.ts`
- Create: `__tests__/lib/generate-questions.test.ts`

The `SYSTEM_PROMPT` constant (line 5) becomes a `buildSystemPrompt` function. Both `generateFromChunk` and `generateQuestions` gain a `focusLessonContent` parameter. The retry call must also pass it through.

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/generate-questions.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildSystemPrompt } from '@/lib/ai/generate-questions'

describe('buildSystemPrompt', () => {
  it('returns base prompt without focus instruction when false', () => {
    const prompt = buildSystemPrompt(false)
    expect(prompt).toContain('You are a study assistant')
    expect(prompt).not.toContain('Focus exclusively on subject matter')
  })

  it('appends focus instruction when true', () => {
    const prompt = buildSystemPrompt(true)
    expect(prompt).toContain('You are a study assistant')
    expect(prompt).toContain('Focus exclusively on subject matter concepts')
    expect(prompt).toContain('Skip any content about: deadlines')
    expect(prompt).toContain('return fewer questions rather than asking about irrelevant material')
  })

  it('focus instruction appears after base prompt', () => {
    const prompt = buildSystemPrompt(true)
    const baseIndex = prompt.indexOf('You are a study assistant')
    const focusIndex = prompt.indexOf('Focus exclusively')
    expect(focusIndex).toBeGreaterThan(baseIndex)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run __tests__/lib/generate-questions.test.ts`
Expected: FAIL — `buildSystemPrompt is not exported` or similar

- [ ] **Step 3: Implement the changes in `lib/ai/generate-questions.ts`**

Replace the entire file with:

```ts
import { MAX_INPUT_CHARS } from './chunk-text'
import { createAIClient } from './create-ai-client'
import type { Question, AIConfig } from '@/types'

const BASE_SYSTEM_PROMPT = `You are a study assistant that generates quiz questions from educational text.
Always respond with valid JSON only — no explanation, no markdown, no code fences.

Return a JSON array where each object has:
  - "type": "mcq" or "short_answer"
  - "question_text": string
  - "options": array of {label, text} for MCQ (labels "A","B","C","D"), null for short_answer
  - "correct_answer": for MCQ, the label ("A","B","C","D"); for short_answer, a single word or short phrase (max 5 words) for exact matching

For short_answer, correct_answer MUST be terse (1–5 words) to enable exact string matching.`

const FOCUS_INSTRUCTION = `

Focus exclusively on subject matter concepts, theories, definitions, and principles.
Skip any content about: deadlines, submission dates, assessment weightings, course schedules,
administrative procedures, contact details, or program structure.
If a passage contains only administrative content, do not generate questions for it — return
fewer questions rather than asking about irrelevant material.`

export function buildSystemPrompt(focusLessonContent: boolean): string {
  return focusLessonContent ? BASE_SYSTEM_PROMPT + FOCUS_INSTRUCTION : BASE_SYSTEM_PROMPT
}

async function generateFromChunk(
  chunk: string,
  studySetId: string,
  n: number,
  aiConfig: AIConfig,
  customPrompt?: string,
  focusLessonContent?: boolean,
  retries = 1
): Promise<Omit<Question, 'id' | 'created_at'>[]> {
  const { client, model } = createAIClient(aiConfig)

  const baseWithN = aiConfig.basePrompt.replace('{n}', String(n))
  const userMessage = [
    baseWithN,
    '',
    'Text:',
    chunk,
    customPrompt ? `\n\nAdditional focus: ${customPrompt}` : '',
  ].filter(Boolean).join('\n')

  try {
    const res = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: buildSystemPrompt(focusLessonContent ?? false) },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.7,
    })
    let raw = res.choices[0].message.content ?? '[]'
    // Strip markdown code fences (DeepSeek sometimes wraps JSON despite instructions)
    const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fenceMatch) raw = fenceMatch[1]
    raw = raw.trim()
    const parsed = JSON.parse(raw) as Record<string, unknown>[]
    return parsed.map(q => ({
      study_set_id: studySetId,
      type: q.type as 'mcq' | 'short_answer',
      question_text: q.question_text as string,
      options: (q.options ?? null) as Question['options'],
      correct_answer: q.correct_answer as string,
    }))
  } catch {
    if (retries > 0) return generateFromChunk(chunk, studySetId, n, aiConfig, customPrompt, focusLessonContent, retries - 1)
    throw new Error('Failed to generate questions after retry')
  }
}

export async function generateQuestions(
  text: string,
  studySetId: string,
  aiConfig: AIConfig,
  customPrompt?: string,
  questionCount = 25,
  focusLessonContent = false
): Promise<Omit<Question, 'id' | 'created_at'>[]> {
  const cappedText = text.slice(0, MAX_INPUT_CHARS)
  return generateFromChunk(cappedText, studySetId, questionCount, aiConfig, customPrompt, focusLessonContent)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run __tests__/lib/generate-questions.test.ts`
Expected: PASS — 3 tests pass

- [ ] **Step 5: Run full test suite to check for regressions**

Run: `npx vitest run`
Expected: all tests pass

- [ ] **Step 6: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add lib/ai/generate-questions.ts __tests__/lib/generate-questions.test.ts
git commit -m "feat: convert SYSTEM_PROMPT to buildSystemPrompt with focus_lesson_content support"
git push origin main
```

---

## Task 3: Generate API

**Files:**
- Modify: `app/api/generate/route.ts:29-31` and `:79-80`

Thread `focus_lesson_content` from the DB into `generateQuestions`.

- [ ] **Step 1: Extend the `.select()` call (line 30)**

Find:
```ts
    .select('id, user_id, generation_status, custom_prompt, question_count_pref')
```

Replace with:
```ts
    .select('id, user_id, generation_status, custom_prompt, question_count_pref, focus_lesson_content')
```

- [ ] **Step 2: Read the value and pass it to generateQuestions (line 79-80)**

Find:
```ts
    const questionCount = (studySet as { question_count_pref?: number | null }).question_count_pref ?? 25
    const questions = await generateQuestions(combinedText, studySetId, aiConfig, customPrompt, questionCount)
```

Replace with:
```ts
    const questionCount = (studySet as { question_count_pref?: number | null }).question_count_pref ?? 25
    const focusLessonContent = (studySet as { focus_lesson_content?: boolean | null }).focus_lesson_content ?? false
    const questions = await generateQuestions(combinedText, studySetId, aiConfig, customPrompt, questionCount, focusLessonContent)
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add app/api/generate/route.ts
git commit -m "feat: pass focus_lesson_content from study set to generateQuestions"
git push origin main
```

---

## Task 4: Settings API

**Files:**
- Modify: `app/api/study-sets/[id]/settings/route.ts:49-53`

Add handling for `focusLessonContent` after the `questionCountPref` block.

- [ ] **Step 1: Add the focusLessonContent block**

After this block (lines 49–53):
```ts
  if (questionCountPref !== undefined) {
    if (![10, 25, 50].includes(questionCountPref))
      return NextResponse.json({ error: 'questionCountPref must be 10, 25, or 50' }, { status: 400 })
    updates.question_count_pref = questionCountPref
  }
```

Add:
```ts

  if ('focusLessonContent' in body) {
    if (typeof body.focusLessonContent !== 'boolean')
      return NextResponse.json({ error: 'focusLessonContent must be a boolean' }, { status: 400 })
    updates.focus_lesson_content = body.focusLessonContent
  }
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Manual smoke test**

Using curl or a REST client, send a PATCH to `/api/study-sets/<any-id>/settings` with `{"focusLessonContent": true}`. With a valid session cookie, expect `{"ok": true}`. With `{"focusLessonContent": "yes"}`, expect `400` with `focusLessonContent must be a boolean`.

- [ ] **Step 4: Commit**

```bash
git add app/api/study-sets/[id]/settings/route.ts
git commit -m "feat: settings API accepts focusLessonContent toggle"
git push origin main
```

---

## Task 5: UI toggle in StudySetSettingsModal

**Files:**
- Modify: `components/dashboard/StudySetSettingsModal.tsx`

Add state, toggle UI with disclaimer, and include in the PATCH payload and `onSaved` partial.

- [ ] **Step 1: Add state (line 28, after `const [error, setError] = useState('')`)**

After:
```ts
  const [confirmDelete, setConfirmDelete] = useState(false)
```

Add:
```ts
  const [focusLessonContent, setFocusLessonContent] = useState(studySet.focus_lesson_content ?? false)
```

- [ ] **Step 2: Add focusLessonContent to the PATCH body in save()**

In the `save()` function, find the `JSON.stringify` call:
```ts
      body: JSON.stringify({
        name: name.trim(),
        subjectId: subjectId || null,
        customPrompt: prompt.trim() || null,
        questionCountPref: questionCount,
      }),
```

Replace with:
```ts
      body: JSON.stringify({
        name: name.trim(),
        subjectId: subjectId || null,
        customPrompt: prompt.trim() || null,
        questionCountPref: questionCount,
        focusLessonContent,
      }),
```

- [ ] **Step 3: Add focusLessonContent to the onSaved partial**

Find:
```ts
      onSaved({
        name: name.trim(),
        subject_id: subjectId || null,
        custom_prompt: prompt.trim() || null,
        question_count_pref: questionCount,
      })
```

Replace with:
```ts
      onSaved({
        name: name.trim(),
        subject_id: subjectId || null,
        custom_prompt: prompt.trim() || null,
        question_count_pref: questionCount,
        focus_lesson_content: focusLessonContent,
      })
```

- [ ] **Step 4: Add the toggle UI below the Custom Instructions section**

The Custom Instructions section ends with this closing `</div>` (around line 159):
```tsx
          </div>

          {/* Question count */}
```

Add the toggle section between Custom Instructions and Question count:

```tsx
          {/* Focus lesson content */}
          <div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                Focus on lesson content only
              </label>
              <button
                type="button"
                role="switch"
                aria-checked={focusLessonContent}
                onClick={() => setFocusLessonContent(v => !v)}
                className="relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors"
                style={{
                  background: focusLessonContent ? 'var(--accent-cyan)' : 'var(--bg-border)',
                }}
              >
                <span
                  className="inline-block h-5 w-5 rounded-full transition-transform"
                  style={{
                    background: 'var(--text-primary)',
                    transform: focusLessonContent ? 'translate(21px, 2px)' : 'translate(2px, 2px)',
                  }}
                />
              </button>
            </div>
            <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
              The AI will attempt to skip administrative content such as deadlines and course schedules. Results may not be perfect.
            </p>
          </div>
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Run full test suite**

Run: `npx vitest run`
Expected: all tests pass

- [ ] **Step 7: Manual end-to-end verification**

1. Open the app → Dashboard → gear icon on a study set
2. Confirm the "Focus on lesson content only" toggle appears below Custom Instructions, defaulting to off
3. Confirm the disclaimer text is visible beneath the toggle
4. Toggle it on, click Save Changes — confirm no errors
5. Re-open the settings modal — confirm the toggle is still on (persisted)
6. Click "Regenerate Questions" — confirm generation completes successfully
7. Toggle it off, save, regenerate — confirm generation still works

- [ ] **Step 8: Commit**

```bash
git add components/dashboard/StudySetSettingsModal.tsx
git commit -m "feat: add focus lesson content toggle to study set settings modal"
git push origin main
```
