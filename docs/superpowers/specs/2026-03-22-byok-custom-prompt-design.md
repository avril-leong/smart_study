# BYOK & Custom Question Prompt Design

## Overview

Two related features that give users control over how their questions are generated:

1. **BYOK (Bring Your Own Key)** — users supply their own AI provider API key (OpenAI, DeepSeek, or OpenRouter) stored encrypted in the database. Falls back to the server's DeepSeek key if not configured.
2. **Custom Prompts** — a user-editable base prompt (global default, pre-filled with the current well-crafted template) plus per-study-set custom instructions appended on top. Protected from prompt injection.

---

## Database Schema

### New table: `user_ai_settings`

One row per user. Created on first save, upserted thereafter.

```sql
CREATE TABLE user_ai_settings (
  user_id              uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  provider             text NOT NULL DEFAULT 'deepseek'
                       CHECK (provider IN ('openai', 'deepseek', 'openrouter')),
  model                text NOT NULL DEFAULT 'deepseek-chat',
  encrypted_key        text,        -- AES-256-GCM ciphertext (hex); NULL = no BYOK
  key_iv               text,        -- 12-byte IV (hex); NULL when encrypted_key is NULL
  global_custom_prompt text,        -- user's global custom instruction; NULL = none
  base_prompt          text,        -- user's editable base prompt; NULL = use server default
  updated_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_ai_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user owns ai settings" ON user_ai_settings
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
```

### Modified table: `study_sets`

```sql
ALTER TABLE study_sets ADD COLUMN custom_prompt text; -- NULL = use global default
```

---

## Encryption

**Module:** `lib/crypto.ts`

- Algorithm: AES-256-GCM
- Key source: `SETTINGS_ENCRYPTION_KEY` env var (64-char hex = 32 bytes). Must be set in both `.env.local` and Vercel environment variables.
- `encryptKey(plaintext: string): { encrypted: string; iv: string }` — generates a random 12-byte IV per call, returns hex-encoded ciphertext and IV.
- `decryptKey(encrypted: string, iv: string): string` — decrypts using the same env key.
- The decrypted key is **never** returned to the client. The GET endpoint returns `{ hasKey: boolean }` only (not the key or ciphertext).

**Prompt injection protection** (also in `lib/crypto.ts` or a sibling `lib/sanitize.ts`):
- `sanitizePrompt(input: string, maxLength: number): string` — trims whitespace, strips control characters (`\x00`–`\x1F` except `\n` and `\t`), truncates to `maxLength`.
- Base prompt max: 1000 characters. Custom prompt max: 500 characters.
- Applied server-side before any prompt is passed to the AI. User prompts are **structurally isolated** in the user message with explicit labels and never placed in the system role.

---

## Provider Map

| Provider | `baseURL` | Default model |
|---|---|---|
| `openai` | `https://api.openai.com/v1` | `gpt-4o-mini` |
| `deepseek` | `https://api.deepseek.com` | `deepseek-chat` |
| `openrouter` | `https://openrouter.ai/api/v1` | `openai/gpt-4o-mini` |

---

## Server-Side Architecture

### `lib/ai/create-ai-client.ts`

```typescript
createAIClient({ provider, apiKey, model }): { client: OpenAI; model: string }
```

Returns a configured OpenAI-SDK client pointing at the correct `baseURL` and the resolved model name (falls back to provider default if model is empty).

### `lib/ai/get-user-ai-config.ts`

```typescript
getUserAIConfig(userId: string): Promise<AIConfig>
```

Reads `user_ai_settings` for the user. If no row or no `encrypted_key`, returns the server fallback (`DEEPSEEK_API_KEY`, `deepseek-chat`). Otherwise decrypts the key and returns `{ provider, apiKey, model, basePrompt, globalCustomPrompt }`.

### `lib/ai/generate-questions.ts`

Signature change:

```typescript
generateQuestions(
  text: string,
  studySetId: string,
  aiConfig: AIConfig,
  customPrompt?: string   // per-set instruction (already resolved: set > global > none)
): Promise<...>
```

- Builds the AI client dynamically from `aiConfig`.
- **System prompt** (locked, not user-editable): JSON format contract only — `"You are a study assistant... Always respond with valid JSON only."`
- **User message** structure:
  ```
  [base prompt — instructional part, sanitized]

  Text:
  <chunk>

  Style instructions: <sanitized base prompt from aiConfig>
  [Additional focus: <sanitized customPrompt>]   ← only if present
  ```
- Output is validated as JSON; non-parseable responses retry once (existing behaviour).

### `lib/ai/get-feedback.ts`

Same treatment — builds client dynamically from `AIConfig`. No custom prompt applied here (feedback generation is not user-configurable in this scope).

### `app/api/settings/ai/route.ts`

- `GET` — returns `{ provider, model, hasKey, globalCustomPrompt, basePrompt }`. Never returns the raw or encrypted key.
- `POST` — accepts `{ provider, model, apiKey?, globalCustomPrompt?, basePrompt? }`. Sanitizes prompts. Encrypts key if provided. Upserts `user_ai_settings`.

### `app/api/generate/route.ts`

After auth, calls `getUserAIConfig(user.id)` and resolves the effective custom prompt (`study_set.custom_prompt ?? globalCustomPrompt ?? undefined`), then passes both to `generateQuestions`.

---

## Default Base Prompt

The server-side default (used when `user_ai_settings.base_prompt` is NULL):

```
Generate {n} quiz questions from the text below.
Return a JSON array where each object has:
  - "type": "mcq" or "short_answer"
  - "question_text": string
  - "options": array of {label, text} for MCQ (labels "A","B","C","D"), null for short_answer
  - "correct_answer": for MCQ, the label ("A","B","C","D"); for short_answer, a single word or short phrase (max 5 words) for exact matching

Distribute types: 70% mcq, 30% short_answer.
For short_answer, correct_answer MUST be terse (1–5 words) to enable exact string matching.
```

This is stored in `lib/ai/generate-questions.ts` as `DEFAULT_BASE_PROMPT` and exported so the Settings page can pre-fill the textarea.

---

## UI Changes

### Settings page (`app/settings/page.tsx`)

Two new sections added between Subjects and Account:

#### AI Provider section

- Provider `<select>`: OpenAI / DeepSeek / OpenRouter
- Model `<input type="text">`: placeholder shows provider default (e.g. `gpt-4o-mini`)
- API key `<input type="password">`: placeholder `••••••••` if `hasKey` is true, otherwise `Paste your API key`
- Collapsible "How to get your key" guide (one per provider, shown based on selected provider):
  - Sign-up URL, API key page location, recommended model, brief cost note
- Privacy notice: small muted text + lock icon below the key field — *"Your key is encrypted at rest and only used to generate your questions. We never store it in plain text."* — styled subtly (small font, muted colour, not a warning banner)
- Save button with inline success/error toast

#### Question Style section

- Label: **Question Generation Style**
- Short guide above textarea: *"This controls how the AI crafts your questions — style, difficulty, question type mix. The JSON format is handled automatically. You can reset to the recommended default at any time."*
- `<textarea>` pre-filled with `DEFAULT_BASE_PROMPT` (from server if no saved value)
- "Reset to default" button (restores `DEFAULT_BASE_PROMPT` in the textarea without saving)
- Character counter showing `n / 1000`
- Save button

#### Global Custom Instructions section

- Label: **Default Custom Instructions**
- Short guide: *"Optional extra context added to every study set unless the set has its own instructions. Example: 'Focus on definitions and key terms' or 'Generate harder application-level questions'."*
- `<textarea>` (max 500 chars) with character counter
- Save button

### Upload page (`app/upload/page.tsx`)

- New optional `<textarea>` below SubjectSelector: **Custom instructions (optional)**
- Placeholder: *"e.g. 'Focus on key dates and figures', 'Generate harder application questions'"*
- Pre-filled with `globalCustomPrompt` from user settings (fetched alongside subjects on mount)
- Value stored in `study_sets.custom_prompt` when the set is created

### AddDocumentModal (`components/dashboard/AddDocumentModal.tsx`)

- Same optional textarea as upload page, shown below the mode selector
- Pre-filled with `studySet.custom_prompt ?? globalCustomPrompt`
- Passed to the generate API call body as `customPrompt`

### Dashboard StudySetCard — "Edit prompt" button

- New "Edit prompt" button in hover actions (between Refresh and Delete)
- Opens a small `EditPromptModal` component (`components/dashboard/EditPromptModal.tsx`):
  - Textarea pre-filled with `studySet.custom_prompt ?? ''`
  - Placeholder shows global default if set, otherwise example text
  - Save calls `PATCH /api/study-sets/[id]/prompt` which updates `study_sets.custom_prompt`
  - Does **not** trigger regeneration — just saves the prompt for next generation

### New API route: `app/api/study-sets/[id]/prompt/route.ts`

- `PATCH` — validates ownership, sanitizes input (≤ 500 chars), updates `study_sets.custom_prompt`. Returns `{ ok: true }`.

---

## Error Handling

- If decryption fails (e.g. `SETTINGS_ENCRYPTION_KEY` rotated), `getUserAIConfig` falls back to the server key and logs a server-side warning. The user sees normal generation — they may notice quality differences and can re-save their key.
- If the BYOK API key is invalid (provider returns 401/403), the generate API returns `{ error: 'AI provider rejected the API key. Check your key in Settings.' }` with status 500.
- If the base prompt is so malformed that JSON parsing fails after retry, the existing error path sets `generation_status = 'error'` as before.

---

## Out of Scope

- Allowing users to edit the locked system prompt (JSON format contract).
- Applying BYOK to the feedback endpoint's provider choice (feedback always uses the same config as generation, but no separate feedback-specific prompt).
- Key rotation UI (users can overwrite by saving a new key).
- Usage tracking or cost estimation per provider.
