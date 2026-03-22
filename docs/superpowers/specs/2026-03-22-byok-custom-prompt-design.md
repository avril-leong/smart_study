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
  encrypted_key        text,        -- AES-256-GCM ciphertext+auth_tag (hex); NULL = no BYOK
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

The `StudySet` interface in `types/index.ts` gains `custom_prompt: string | null`.

---

## Shared Types

Add to `types/index.ts`:

```typescript
export type AIProvider = 'openai' | 'deepseek' | 'openrouter'

export interface AIConfig {
  provider: AIProvider
  apiKey: string        // decrypted, server-side only
  model: string         // resolved (never empty — falls back to provider default)
  basePrompt: string    // resolved (never empty — falls back to DEFAULT_BASE_PROMPT)
  globalCustomPrompt: string | null
}
```

---

## Encryption

**Module:** `lib/crypto.ts`

**Runtime:** Node.js only (`node:crypto`). This module must not be used in Edge runtime routes.

- Algorithm: AES-256-GCM
- Key source: `SETTINGS_ENCRYPTION_KEY` env var (64-char hex = 32 bytes). Must be set in both `.env.local` and Vercel environment variables.
- The 16-byte GCM authentication tag is appended to the ciphertext before hex-encoding, so `encrypted_key` stores `ciphertext + authTag` (hex). Decryption splits the last 32 hex chars (16 bytes) as the auth tag and verifies integrity before returning plaintext. If verification fails, the function throws.
- `encryptKey(plaintext: string): { encrypted: string; iv: string }` — generates a random 12-byte IV per call; returns hex-encoded `ciphertext+authTag` and IV.
- `decryptKey(encrypted: string, iv: string): string` — splits auth tag, verifies, decrypts.
- The decrypted key is **never** returned to the client. The GET endpoint returns `{ hasKey: boolean }` only.

---

## Prompt Injection Protection

**Module:** `lib/sanitize.ts`

- `sanitizePrompt(input: string, maxLength: number): string`
  - Trims whitespace
  - Strips control characters (`\x00`–`\x1F` except `\n` and `\t`)
  - Truncates to `maxLength`
  - Rejects obvious override patterns in the base prompt (case-insensitive): if input contains phrases like `"ignore previous instructions"`, `"disregard"`, `"you are now"`, `"system prompt"`, the function throws a `ValidationError` so the API route returns 400
- Base prompt max: 1000 characters. Custom prompt max: 500 characters.
- Applied **server-side only** — client character counters are UX only; the POST handler enforces hard limits regardless of client input.
- User prompts are **structurally isolated** in the user message with explicit labels and never placed in the system role.

**Threat model:** Users can only affect their own generations. The server's DeepSeek fallback key is protected by Vercel's environment variable isolation — it is never readable from client code. If a user has no BYOK configured and abuses the base prompt to generate unusual output, the worst case is malformed questions that fail JSON parsing and trigger `generation_status = 'error'` on their own set.

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
createAIClient(config: Pick<AIConfig, 'provider' | 'apiKey' | 'model'>): { client: OpenAI; model: string }
```

Returns a configured OpenAI-SDK client pointing at the correct `baseURL` and the resolved model name (falls back to provider default if model is empty).

### `lib/ai/get-user-ai-config.ts`

```typescript
getUserAIConfig(userId: string, serviceClient: SupabaseClient): Promise<AIConfig>
```

Uses the **service-role client** (passed in) to read `user_ai_settings` for the user. If no row or no `encrypted_key`, returns the server fallback (`DEEPSEEK_API_KEY`, provider `'deepseek'`, model `'deepseek-chat'`). Otherwise decrypts the key and returns the full `AIConfig`. If decryption throws, logs server-side warning and falls back to server key.

### `lib/ai/generate-questions.ts`

Exports `DEFAULT_BASE_PROMPT` (the current hardcoded instructional prompt) so the Settings page can pre-fill the textarea.

Signature change:

```typescript
generateQuestions(
  text: string,
  studySetId: string,
  aiConfig: AIConfig,
  customPrompt?: string   // per-set instruction (resolved: set > global > none), already sanitized
): Promise<Omit<Question, 'id' | 'created_at'>[]>
```

Internal `generateFromChunk` receives the same `aiConfig` and `customPrompt` and builds its client dynamically.

**User message structure** (the base prompt is placed here, not in the system role):

```
{sanitized aiConfig.basePrompt with {n} replaced}

Text:
{chunk}
{if customPrompt}: \n\nAdditional focus: {sanitized customPrompt}
```

**System prompt** (locked, not user-editable):
```
You are a study assistant that generates quiz questions from educational text.
Always respond with valid JSON only — no explanation, no markdown, no code fences.

Return a JSON array where each object has:
  - "type": "mcq" or "short_answer"
  - "question_text": string
  - "options": array of {label, text} for MCQ (labels "A","B","C","D"), null for short_answer
  - "correct_answer": for MCQ, the label ("A","B","C","D"); for short_answer, a single word or short phrase (max 5 words) for exact matching

For short_answer, correct_answer MUST be terse (1–5 words) to enable exact string matching.
```

The JSON schema is locked here so users never need to include it in their base prompt.

Output is validated as JSON; non-parseable responses retry once (existing behaviour).

### `lib/ai/get-feedback.ts`

Refactored to accept `aiConfig: AIConfig` instead of using a module-level client. No custom prompt applied.

### `app/api/settings/ai/route.ts`

- `GET` — authenticated; reads `user_ai_settings` via service-role client; returns `{ provider, model, hasKey: boolean, globalCustomPrompt, basePrompt }`. Never returns the raw or encrypted key.
- `POST` — authenticated; accepts `{ provider, model, apiKey?, globalCustomPrompt?, basePrompt? }` as a **single payload for the entire AI settings form** (one Save button, not three separate ones). Sanitizes prompts server-side. Encrypts key if provided. Upserts `user_ai_settings`. Returns `{ ok: true }` or `{ error }`.

### `app/api/settings/ai/test/route.ts`

- `POST` — accepts `{ provider, model, apiKey }` (plaintext key, never stored in this route). Makes a minimal completions call (`max_tokens: 1`) to verify the key is valid. Returns `{ ok: true }` or `{ error: 'Invalid API key' }` (status 400). This is called client-side before the user saves, so they get immediate feedback.

### `app/api/generate/route.ts`

After auth, calls `getUserAIConfig(user.id, serviceClient)`. Resolves effective custom prompt: `studySet.custom_prompt ?? aiConfig.globalCustomPrompt ?? undefined`. Sanitizes. Passes both to `generateQuestions`.

### `app/api/study-sets/[id]/prompt/route.ts`

- `PATCH` — authenticated; validates ownership (service-role client); sanitizes input (≤ 500 chars); updates `study_sets.custom_prompt`. Returns `{ ok: true }`.

### Upload API (`app/api/upload/route.ts`)

Accepts an optional `customPrompt` field in the form data. Sanitizes (≤ 500 chars) and saves it to `study_sets.custom_prompt` when creating the new study set row.

---

## Default Base Prompt

Stored in `lib/ai/generate-questions.ts` as exported constant `DEFAULT_BASE_PROMPT`:

```
Generate {n} quiz questions from the text below.
Distribute types: 70% multiple choice, 30% short answer.
Short answer questions should have brief, specific answers suitable for exact matching.
```

Used when `user_ai_settings.base_prompt` is NULL. The `{n}` placeholder is replaced at generation time.

---

## UI Changes

### Settings page (`app/settings/page.tsx`)

Two new sections added between Subjects and Account. All three fields (provider/model/key, base prompt, global custom instructions) are saved with a **single "Save AI Settings" button** at the bottom of the combined section. This prevents partial-update data loss.

#### AI Provider section

- Provider `<select>`: OpenAI / DeepSeek / OpenRouter
- Model `<input type="text">`: placeholder shows provider default (e.g. `gpt-4o-mini`)
- API key `<input type="password">`: placeholder `••••••••` if `hasKey` is true, otherwise `Paste your API key`
- **"Test key" button** next to the key field — calls `/api/settings/ai/test` with the current input to validate before saving. Shows ✓ or error inline.
- Collapsible "How to get your key" guide (shown per selected provider):
  - Sign-up URL, API key page location, recommended model, brief cost/capability note
- Privacy notice: small muted text + lock icon below the key field — *"Your key is encrypted at rest and only used to generate your questions. We never store it in plain text."* — styled subtly (small font, muted colour, not a warning banner)

#### Question Generation Style section

- Short guide: *"This controls how the AI crafts your questions — style, difficulty, question type mix. The JSON format is handled automatically. You can reset to the recommended default at any time."*
- `<textarea>` pre-filled with saved value or `DEFAULT_BASE_PROMPT`
- "Reset to default" button (restores `DEFAULT_BASE_PROMPT` in the textarea, does not save)
- Character counter `n / 1000`

#### Default Custom Instructions section

- Short guide: *"Optional extra context added to every study set unless the set has its own instructions. Example: 'Focus on definitions and key terms' or 'Generate harder application-level questions'."*
- `<textarea>` (max 500 chars) with character counter `n / 500`

#### Single Save button

- **"Save AI Settings"** — submits all three sections as one payload to `POST /api/settings/ai`
- Inline success/error feedback

### Upload page (`app/upload/page.tsx`)

- New optional `<textarea>` below SubjectSelector: **Custom instructions (optional)**
- Placeholder: *"e.g. 'Focus on key dates and figures', 'Generate harder application questions'"*
- Pre-filled with `globalCustomPrompt` fetched from `/api/settings/ai` on mount (alongside subjects)
- Sent as `customPrompt` field in the upload form data; saved to `study_sets.custom_prompt` in the upload API

### AddDocumentModal (`components/dashboard/AddDocumentModal.tsx`)

- Same optional textarea below the mode selector
- Pre-filled with `studySet.custom_prompt ?? globalCustomPrompt` (globalCustomPrompt fetched from `/api/settings/ai` on modal open)
- Passed to the generate API call body as `customPrompt` (the generate API sanitizes it again)

### Dashboard StudySetCard — "Edit prompt" button

- New "Edit prompt" button in hover actions (between Refresh and Delete)
- Opens `EditPromptModal` (`components/dashboard/EditPromptModal.tsx`):
  - Textarea pre-filled with `studySet.custom_prompt ?? ''`
  - Placeholder: global default if set, otherwise example text
  - Character counter `n / 500`
  - Save calls `PATCH /api/study-sets/[id]/prompt`
  - Does **not** trigger regeneration — just saves for the next generation run

---

## Error Handling

- **Decryption failure** (`SETTINGS_ENCRYPTION_KEY` rotated): `getUserAIConfig` logs server-side warning, silently falls back to server key. User sees normal generation.
- **Invalid BYOK key** (provider returns 401/403): generate API returns `{ error: 'AI provider rejected the API key. Check your key in Settings.' }` with status **502** (Bad Gateway — upstream rejected the key, not a server bug).
- **Malformed base prompt** (JSON parsing fails after retry): existing error path sets `generation_status = 'error'`.
- **Prompt injection detected** (`sanitizePrompt` throws): `POST /api/settings/ai` returns 400 with `{ error: 'Prompt contains disallowed content' }`.

---

## Out of Scope

- Allowing users to edit the locked system prompt (JSON format contract).
- Per-provider custom prompt (feedback uses same `AIConfig` as generation).
- Key rotation UI (users overwrite by saving a new key).
- Usage tracking or cost estimation per provider.
