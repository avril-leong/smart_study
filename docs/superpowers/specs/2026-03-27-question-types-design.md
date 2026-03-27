# Question Types Preference — Design Spec
**Date:** 2026-03-27
**Status:** Approved

## Overview

Allow users to control which question types are generated per study set: Multiple Choice (MCQ), Short Answer, and Multi-select (select all that apply). Configuration is available on both the upload page (at creation) and the settings modal (post-creation). Multi-select is a new question type with binary grading.

---

## Data Model

### `study_sets` table — new column

```sql
ALTER TABLE study_sets
  ADD COLUMN IF NOT EXISTS question_types_pref text[]
  DEFAULT ARRAY['mcq','short_answer'];
```

- Default `['mcq','short_answer']` preserves existing behaviour for all current study sets.
- Valid values: any non-empty subset of `['mcq','short_answer','multi_select']`.

### `questions` table — no change

Multi-select correct answers use the existing `correct_answer text` column, storing comma-separated option labels (e.g. `"A,C"`). No schema migration needed for `questions`.

### `types/index.ts`

```ts
export type QuestionType = 'mcq' | 'short_answer' | 'multi_select'
```

Add `question_types_pref?: QuestionType[]` to `StudySet`.

---

## AI Prompt & Generation

### `lib/ai/generate-questions.ts`

`buildSystemPrompt` gains a `questionTypes: QuestionType[]` parameter. The system prompt description block conditionally includes the multi-select format:

```
- "type": "multi_select"
- "question_text": string — phrased as "Which of the following... (select all that apply)"
- "options": array of {label, text} with labels A–D
- "correct_answer": comma-separated labels of ALL correct options, e.g. "A,C" or "B,C,D"
  Multi-select questions must have exactly 2–3 correct answers.
```

`generateFromChunk` and `generateQuestions` accept `questionTypes: QuestionType[]` (replaces the implicit mixed generation). The user message prompt line becomes:

```
Generate {n} questions. Use only these question types: {humanReadableList}.
```

Examples:
- `['mcq']` → `"Use only these question types: MCQ."`
- `['mcq','short_answer','multi_select']` → `"Use only these question types: MCQ, short answer, multi-select (select all that apply)."`

### `app/api/generate/route.ts`

Read `question_types_pref` from the study set row (fall back to `['mcq','short_answer']` if null) and pass to `generateQuestions`.

---

## Settings API

### `app/api/study-sets/[id]/settings/route.ts`

Accept `questionTypesPref: string[]` in the PATCH body.

Validation:
- Must be an array.
- Must be non-empty (at least one type required).
- Each element must be one of `'mcq'`, `'short_answer'`, `'multi_select'`.

Maps to `question_types_pref` on the DB row.

---

## Shared UI Component

### `components/ui/QuestionTypesPicker.tsx`

```ts
interface Props {
  value: QuestionType[]
  onChange: (v: QuestionType[]) => void
  disabled?: boolean
}
```

Renders three labelled checkboxes:
- **Multiple Choice** (`mcq`)
- **Short Answer** (`short_answer`)
- **Multi-select** (`multi_select`) — sub-label: "select all that apply"

Constraint: attempting to deselect the last remaining type is a no-op (the checkbox stays checked).

Uses existing CSS variable tokens; checkbox border/fill uses `--accent-cyan` for checked state.

---

## Integration Points

### `components/dashboard/StudySetSettingsModal.tsx`

- Add `questionTypesPref` state: `useState<QuestionType[]>(studySet.question_types_pref ?? ['mcq','short_answer'])`
- Render `<QuestionTypesPicker>` between "Focus on lesson content" toggle and "Questions per Generation" segmented control
- Include in PATCH body and `onSaved` partial

### `app/upload/page.tsx`

- Add `questionTypesPref` state: `useState<QuestionType[]>(['mcq','short_answer'])`
- Render `<QuestionTypesPicker>` below the custom instructions textarea
- Pass `questionTypesPref` to `/api/upload/sign` and `/api/upload/process` so it is stored on the new study set row at creation

### `app/api/upload/process/route.ts` (or equivalent)

Accept `questionTypesPref` and write it to the `study_sets` row on creation.

---

## Study Session — Multi-select

### `types/index.ts`

Extend `AnswerButton` state union: add `'selected'` (option is toggled on before submission).

### `components/study/QuestionCard.tsx`

Add a third branch for `multi_select`:

1. Render four `AnswerButton` components, each independently toggleable.
2. Track `selectedLabels: string[]` in local state.
3. Show a **Submit** button (disabled until at least one option is selected).
4. On submit, call `onAnswer(selectedLabels.join(','))`.
5. After `answered`:
   - Parse `correct_answer.split(',')` → `correctSet`.
   - Each option state:
     - In `correctSet` → `'correct'` (green, whether or not the student selected it)
     - Selected but NOT in `correctSet` → `'wrong'` (red)
     - Neither selected nor correct → `'reveal'` (dim)

### `components/study/AnswerButton.tsx`

Add `'selected'` to the state union. Visual treatment: slightly stronger background fill than `'idle'` (use `--answer-x-mid` instead of `--answer-x-subtle`), border stays the answer colour. No border-width change needed.

### Grading (binary)

In `useStudySession` (or wherever `submitAnswer` is handled), multi-select grading:
```ts
const correctSet = new Set(question.correct_answer.split(',').map(s => s.trim()))
const givenSet   = new Set(givenAnswer.split(',').map(s => s.trim()))
const isCorrect  = correctSet.size === givenSet.size &&
                   [...correctSet].every(l => givenSet.has(l))
```

SM-2 quality input: correct → 4, wrong → 1 (same as MCQ).

---

## What Does Not Change

- `question_state` table — no change
- `answer_logs` table — no change (answer stored as the comma-separated string)
- SM-2 algorithm — no change
- FeedbackPanel — no change
- SessionProgress / SessionComplete — no change

---

## Out of Scope

- Partial credit grading (deferred)
- Per-question weighting
- Percentage-based type mix control
- More than 4 options on multi-select questions
