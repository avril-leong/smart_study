# Generation Style Design

**Date:** 2026-03-28
**Status:** Approved

## Overview

Add a required **Generation Style** setting to each study set — either **General** or **Exam Prep** — that controls the pedagogical instructions baked into the fixed AI system prompt. Remove the user-editable base prompt and global custom instructions from AI Settings; custom instructions live only on individual study sets.

---

## Data Model

New column on `study_sets`:

```sql
ALTER TABLE study_sets
  ADD COLUMN generation_style text NOT NULL DEFAULT 'general'
  CHECK (generation_style IN ('general', 'exam_prep'));
```

- `DEFAULT 'general'` applies only to existing rows (migration safety).
- The app enforces an explicit choice on all new study sets — the upload page blocks submission until one is selected.
- Values: `'general'` | `'exam_prep'`.

Add `generation_style` to the `StudySet` TypeScript interface in `types/index.ts`:

```ts
generation_style: 'general' | 'exam_prep'
```

Remove `basePrompt` and `globalCustomPrompt` from the `AIConfig` interface in `types/index.ts`.

---

## System Prompt Design

The JSON format rules and per-type instructions in `BASE_SYSTEM_PROMPT` remain unchanged. Two pedagogical instruction blocks replace the current single prompt — one is selected based on `generation_style`.

### General mode
```
Generate questions that test genuine understanding, not surface recall.
- Cover the breadth of concepts in the text, not just definitions
- Vary difficulty: include foundational questions and ones requiring deeper reasoning
- Write distractors that reflect plausible misconceptions, not obviously wrong answers
- Prefer questions that ask why, how, or what would happen — not just what is
```

### Exam Prep mode
```
Generate exam-style questions that mirror the rigour of formal assessments.
- Distribute questions across cognitive levels: ~30% recall, ~40% comprehension, ~30% application
- Distractors must reflect genuine misconceptions students commonly make
- Questions must be precise and unambiguous — no two interpretations possible
- Prioritise the most important, frequently examined concepts in the text
```

### Composition
The existing `BASE_SYSTEM_PROMPT` constant is renamed to `BASE_FORMAT_RULES` — its content (JSON format rules and per-type instructions) is unchanged.

`buildSystemPrompt(focusLessonContent: boolean, generationStyle: 'general' | 'exam_prep')` returns:

```
BASE_FORMAT_RULES
+ GENERAL_INSTRUCTION | EXAM_PREP_INSTRUCTION   (based on generationStyle)
+ FOCUS_INSTRUCTION                              (if focusLessonContent = true)
```

If `generationStyle` is `undefined` at the call site in `generateFromChunk` or `generateQuestions`, default to `'general'` before passing to `buildSystemPrompt`.

### User message construction
`DEFAULT_BASE_PROMPT` in `lib/ai/constants.ts` simplifies to:

```
Generate {n} quiz questions from the following text.
```

`generateFromChunk` uses this constant directly (not via `aiConfig.basePrompt`):

```ts
const userMessage = [
  DEFAULT_BASE_PROMPT.replace('{n}', String(n)),
  `Use only these question types: ${typeList}.`,
  '',
  'Text:',
  chunk,
  customPrompt ? `\n\nAdditional focus: ${customPrompt}` : '',
].filter(Boolean).join('\n')
```

`aiConfig.basePrompt` is removed entirely — `generateFromChunk` and `generateQuestions` no longer receive it.

### Updated function signatures

```ts
// generate-questions.ts
function generateFromChunk(
  chunk: string,
  studySetId: string,
  n: number,
  aiConfig: AIConfig,
  customPrompt?: string,
  focusLessonContent?: boolean,
  generationStyle?: 'general' | 'exam_prep',
  questionTypes?: QuestionType[],
  retries?: number
): Promise<...>

export async function generateQuestions(
  text: string,
  studySetId: string,
  aiConfig: AIConfig,
  customPrompt?: string,
  questionCount?: number,
  focusLessonContent?: boolean,
  generationStyle?: 'general' | 'exam_prep',
  questionTypes?: QuestionType[]
): Promise<...>
```

---

## API Changes

### `POST /api/upload/process`
- New required field: `generationStyle: 'general' | 'exam_prep'`
- Returns 400 if missing or invalid.
- Stored in `study_sets` INSERT.

### `PATCH /api/study-sets/[id]/settings`
- New optional field: `generationStyle: 'general' | 'exam_prep'`
- Validated and written to `generation_style` column.

### `POST /api/generate`
- Reads `generation_style` from the study set row (add to `.select(...)` query).
- Custom prompt resolution chain simplified to: `bodyCustomPrompt ?? studySet.custom_prompt ?? null` — `aiConfig.globalCustomPrompt` removed.
- Passes `generationStyle` to `generateQuestions(...)`.

### `GET /POST /api/settings/ai`
- `GET`: stop returning `basePrompt` and `globalCustomPrompt` in the response.
- `POST`: silently ignore `basePrompt` and `globalCustomPrompt` fields if sent — do not write them to the DB. Existing DB values are left intact but never used.

---

## UI Changes

### Upload page
- Two clickable choice cards displayed above the submit button, **required** — submit is disabled until one is selected.
- Cards show label + one-line description:
  - **General** — "Broad understanding across topics"
  - **Exam Prep** — "Exam-style rigour, Bloom's taxonomy"
- Remove `globalCustomPrompt` pre-population of the custom instructions textarea — the field starts empty (the global prompt concept is deprecated).
- Remove the `globalCustomPrompt` fetch/state from the upload page entirely.

### Study set settings modal
- 2-option segmented control for generation style, placed **directly above** the question count control (both are generation-behaviour settings and should be grouped together).
- UI order in modal body: Name → Subject → (divider) → Custom Instructions → Focus lesson content → **Generation Style** → Question count → Question types → (divider) → document/regenerate actions → Delete.
- Remove the `globalCustomPrompt` prop from `StudySetSettingsModal`. The custom instructions textarea placeholder falls back to a static hint string.

### AI Settings page
- Remove the base prompt field from the UI entirely.
- Remove the global custom instructions field from the UI entirely.

---

## Cleanup

| Item | Action |
|------|--------|
| `AIConfig.globalCustomPrompt` | Remove from type; remove from all call sites |
| `AIConfig.basePrompt` | Remove from type; `generateFromChunk` uses `DEFAULT_BASE_PROMPT` directly |
| `getUserAIConfig` return value | Remove `basePrompt` and `globalCustomPrompt` fields |
| `user_ai_settings.base_prompt` | Stop reading — existing DB column left intact |
| `user_ai_settings.global_custom_prompt` | Stop reading — existing DB column left intact |
| `generate route` custom prompt chain | Remove `?? aiConfig.globalCustomPrompt` |
| `upload/page.tsx` | Remove `globalCustomPrompt` state, fetch, and textarea pre-population |
| `StudySetSettingsModal` | Remove `globalCustomPrompt` prop |
| AI Settings UI | Remove base prompt + global custom instructions fields |

---

## Files Affected

- `lib/ai/constants.ts` — simplify `DEFAULT_BASE_PROMPT`
- `lib/ai/generate-questions.ts` — new prompt variants, updated signatures, use constant directly
- `lib/ai/get-user-ai-config.ts` — remove `basePrompt` and `globalCustomPrompt` from return
- `types/index.ts` — remove `basePrompt`/`globalCustomPrompt` from `AIConfig`; add `generation_style` to `StudySet`
- `app/api/generate/route.ts` — thread `generationStyle`; simplify custom prompt chain
- `app/api/upload/process/route.ts` — require and store `generationStyle`
- `app/api/study-sets/[id]/settings/route.ts` — accept `generationStyle` PATCH
- `app/api/settings/ai/route.ts` — stop returning/writing `basePrompt` and `globalCustomPrompt`
- `app/upload/page.tsx` — required choice cards; remove `globalCustomPrompt` usage
- `components/dashboard/StudySetSettingsModal.tsx` — segmented control; remove `globalCustomPrompt` prop; reorder controls
- `app/settings/page.tsx` (AI Settings) — remove base prompt + global custom instructions fields
