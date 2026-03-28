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
`buildSystemPrompt(focusLessonContent, generationStyle)` returns:

```
BASE_FORMAT_RULES
+ GENERAL_INSTRUCTION | EXAM_PREP_INSTRUCTION   (based on generationStyle)
+ FOCUS_INSTRUCTION                              (if focusLessonContent = true)
```

### DEFAULT_BASE_PROMPT simplification
`lib/ai/constants.ts` simplifies to:

```
Generate {n} quiz questions from the following text.
```

The old distribution guidance (`70% multiple choice, 30% short answer`) is removed — question types are now user-controlled.

---

## UI Changes

### Upload page
- Two clickable choice cards displayed above the submit button, **required** — submit is disabled until one is selected.
- Cards show label + one-line description:
  - **General** — "Broad understanding across topics"
  - **Exam Prep** — "Exam-style rigour, Bloom's taxonomy"

### Study set settings modal
- 2-option segmented control (same pattern as question count) allowing users to switch style after creation.

### AI Settings page
- Remove the `base_prompt` field from the UI — existing DB values are ignored by the generate route.
- Remove the `global_custom_prompt` field from the UI — custom instructions now live only on individual study sets.

---

## API Changes

### `POST /api/upload/process`
- New required field: `generationStyle: 'general' | 'exam_prep'`
- Validated server-side; returns 400 if missing or invalid.
- Stored in `study_sets` INSERT.

### `PATCH /api/study-sets/[id]/settings`
- New optional field: `generationStyle: 'general' | 'exam_prep'`
- Validated and applied to `generation_style` column.

### `POST /api/generate`
- Reads `generation_style` from the study set row.
- Passes to `buildSystemPrompt(focusLessonContent, generationStyle)`.
- `getUserAIConfig` no longer reads or returns `base_prompt` or `globalCustomPrompt` — both removed from `AIConfig` type and all call sites.

---

## Cleanup

| Item | Action |
|------|--------|
| `AIConfig.globalCustomPrompt` | Remove from type and all usages |
| `AIConfig.basePrompt` | Remove from type; `DEFAULT_BASE_PROMPT` simplified to `{n}` line only |
| `user_ai_settings.base_prompt` | Stop reading — existing DB column left intact, no migration needed |
| `user_ai_settings.global_custom_prompt` | Stop reading — existing DB column left intact |
| AI Settings UI | Remove base prompt + global custom instructions fields |

---

## Files Affected

- `lib/ai/constants.ts` — simplify `DEFAULT_BASE_PROMPT`
- `lib/ai/generate-questions.ts` — new prompt variants, updated `buildSystemPrompt` signature
- `lib/ai/get-user-ai-config.ts` — remove `basePrompt` and `globalCustomPrompt` from return
- `types/index.ts` — remove `basePrompt` and `globalCustomPrompt` from `AIConfig`
- `app/api/generate/route.ts` — pass `generationStyle` to `buildSystemPrompt`
- `app/api/upload/process/route.ts` — require and store `generationStyle`
- `app/api/study-sets/[id]/settings/route.ts` — accept `generationStyle` PATCH
- `app/upload/page.tsx` — required choice cards UI
- `components/dashboard/StudySetSettingsModal.tsx` — segmented control for style
- `app/settings/page.tsx` (or equivalent) — remove base prompt + global custom instructions fields
