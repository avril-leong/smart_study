# Smart Study App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full-stack AI-driven adaptive study web app with spaced repetition, hosted free on Vercel + Supabase.

**Architecture:** Next.js 14 App Router for frontend and API routes; Supabase for auth, database, and file storage; DeepSeek API (OpenAI-compatible) for question generation and Socratic feedback; SM-2 algorithm for spaced repetition scheduling.

**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS, Supabase (`@supabase/ssr`), OpenAI SDK (pointing at DeepSeek), Framer Motion, Vitest, `pdf-parse`, `officeparser`, `marked`

**Spec:** `docs/superpowers/specs/2026-03-22-smart-study-app-design.md`

---

## File Map

```
smart_study/
├── supabase/migrations/
│   └── 20260322000000_initial_schema.sql   # all tables, RLS, triggers, storage policy
├── app/
│   ├── layout.tsx                           # root layout, fonts, globals
│   ├── globals.css                          # CSS variables (design tokens)
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── register/page.tsx
│   ├── dashboard/page.tsx
│   ├── upload/page.tsx
│   ├── study/[id]/page.tsx
│   ├── study/[id]/complete/page.tsx
│   ├── settings/page.tsx
│   └── api/
│       ├── upload/route.ts
│       ├── generate/route.ts
│       ├── generate/status/[id]/route.ts
│       ├── session/next/route.ts
│       ├── session/answer/route.ts
│       └── feedback/route.ts
├── lib/
│   ├── supabase/client.ts
│   ├── supabase/server.ts
│   ├── parsers/index.ts
│   ├── parsers/pdf.ts
│   ├── parsers/docx.ts
│   ├── parsers/pptx.ts
│   ├── parsers/markdown.ts
│   ├── parsers/txt.ts
│   ├── ai/chunk-text.ts
│   ├── ai/grade-short-answer.ts
│   ├── ai/generate-questions.ts
│   ├── ai/get-feedback.ts
│   └── spaced-repetition/sm2.ts
├── hooks/
│   ├── useStudySets.ts
│   └── useStudySession.ts
├── components/
│   ├── ui/Button.tsx
│   ├── ui/Card.tsx
│   ├── ui/Badge.tsx
│   ├── ui/Input.tsx
│   ├── ui/Modal.tsx
│   ├── ui/Spinner.tsx
│   ├── ui/ProgressBar.tsx
│   ├── ui/ProgressRing.tsx
│   ├── dashboard/SubjectGroup.tsx
│   ├── dashboard/StudySetCard.tsx
│   ├── dashboard/RenameInput.tsx
│   ├── upload/DropZone.tsx
│   ├── upload/SubjectSelector.tsx
│   ├── study/QuestionCard.tsx
│   ├── study/AnswerButton.tsx
│   ├── study/FeedbackPanel.tsx
│   ├── study/SessionProgress.tsx
│   └── study/SessionComplete.tsx
├── types/index.ts
├── middleware.ts
└── __tests__/
    ├── lib/sm2.test.ts
    ├── lib/chunk-text.test.ts
    ├── lib/grade-short-answer.test.ts
    └── lib/parsers.test.ts
```

---

## Task 1: Project Initialization

**Files:**
- Create: `package.json` (via CLI)
- Create: `vitest.config.ts`
- Create: `app/globals.css`
- Create: `app/layout.tsx`

- [ ] **Step 1: Scaffold Next.js app**

```bash
cd /c/SIT/Personal/smart_study
npx create-next-app@14 . --typescript --tailwind --app --no-src-dir --import-alias "@/*"
```
Answer prompts: Yes to TypeScript, Yes to Tailwind, Yes to App Router, No to src dir.

- [ ] **Step 2: Install runtime dependencies**

```bash
npm install @supabase/supabase-js @supabase/ssr openai pdf-parse officeparser marked framer-motion
```

- [ ] **Step 3: Install dev dependencies**

```bash
npm install -D vitest @vitejs/plugin-react @vitest/ui jsdom @types/pdf-parse
```

- [ ] **Step 4: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: { environment: 'jsdom', globals: true },
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
})
```

- [ ] **Step 5: Add test script to `package.json`**

Add to `scripts`: `"test": "vitest run"`, `"test:watch": "vitest"`

- [ ] **Step 6: Write `app/globals.css`**

Replace the generated file entirely:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --bg-base:      #080d1a;
  --bg-surface:   #111827;
  --bg-border:    #1e293b;
  --accent-cyan:  #00c9ff;
  --accent-amber: #f59e0b;
  --success:      #10b981;
  --error:        #f43f5e;
  --text-primary: #f1f5f9;
  --text-muted:   #64748b;
  --answer-a:     #00c9ff;
  --answer-b:     #f59e0b;
  --answer-c:     #a78bfa;
  --answer-d:     #f43f5e;
}

body {
  background-color: var(--bg-base);
  color: var(--text-primary);
}
```

- [ ] **Step 7: Write `app/layout.tsx`**

```typescript
import type { Metadata } from 'next'
import { Syne, Plus_Jakarta_Sans } from 'next/font/google'
import './globals.css'

const syne = Syne({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['400', '600', '700', '800'],
})

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-body',
  weight: ['400', '500', '600'],
})

export const metadata: Metadata = {
  title: 'SmartStudy',
  description: 'AI-powered adaptive study app',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${syne.variable} ${jakarta.variable}`}>
      <body style={{ fontFamily: 'var(--font-body)' }}>{children}</body>
    </html>
  )
}
```

- [ ] **Step 8: Update `tailwind.config.ts`**

```typescript
import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './hooks/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['var(--font-display)', 'sans-serif'],
        body: ['var(--font-body)', 'sans-serif'],
      },
      colors: {
        base: '#080d1a',
        surface: '#111827',
        border: '#1e293b',
        cyan: '#00c9ff',
        amber: '#f59e0b',
        success: '#10b981',
        error: '#f43f5e',
      },
    },
  },
  plugins: [],
}
export default config
```

- [ ] **Step 9: Commit**

```bash
git init && git add -A
git commit -m "feat: initialize Next.js 14 project with Tailwind and Vitest"
```

---

## Task 2: TypeScript Types

**Files:**
- Create: `types/index.ts`

- [ ] **Step 1: Write `types/index.ts`**

```typescript
export type GenerationStatus = 'pending' | 'processing' | 'done' | 'error'
export type QuestionType = 'mcq' | 'short_answer'

export interface Subject {
  id: string
  user_id: string
  name: string
  color: string
  created_at: string
}

export interface StudySet {
  id: string
  user_id: string
  subject_id: string | null
  name: string
  file_name: string
  file_type: string
  extracted_text_path: string
  generation_status: GenerationStatus
  last_studied_at: string | null
  created_at: string
  updated_at: string
  // joined fields (not in DB)
  question_count?: number
  subject?: Subject | null
}

export interface MCQOption {
  label: 'A' | 'B' | 'C' | 'D'
  text: string
}

export interface Question {
  id: string
  study_set_id: string
  type: QuestionType
  question_text: string
  options: MCQOption[] | null
  correct_answer: string
  created_at: string
}

export interface QuestionState {
  user_id: string
  question_id: string
  ease_factor: number
  interval: number
  repetitions: number
  next_review: string
  updated_at: string
}

export interface AnswerLog {
  id: string
  user_id: string
  question_id: string
  answer_given: string
  is_correct: boolean
  answered_at: string
}

export interface SM2Input {
  quality: 0 | 1 | 2 | 3 | 4 | 5
  easeFactor: number
  interval: number
  repetitions: number
}

export interface SM2Result {
  easeFactor: number
  interval: number
  repetitions: number
  nextReview: Date
}
```

- [ ] **Step 2: Commit**

```bash
git add types/index.ts
git commit -m "feat: add shared TypeScript types"
```

---

## Task 3: Database Migration + Supabase Clients

**Files:**
- Create: `supabase/migrations/20260322000000_initial_schema.sql`
- Create: `lib/supabase/client.ts`
- Create: `lib/supabase/server.ts`

- [ ] **Step 1: Install Supabase CLI** (if not already installed)

```bash
npm install -D supabase
npx supabase init
```

- [ ] **Step 2: Create `supabase/migrations/20260322000000_initial_schema.sql`**

```sql
-- Extensions
CREATE EXTENSION IF NOT EXISTS moddatetime;

-- subjects
CREATE TABLE subjects (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES auth.users NOT NULL,
  name       text NOT NULL,
  color      text NOT NULL DEFAULT '#00c9ff',
  created_at timestamptz DEFAULT now()
);

-- study_sets
CREATE TABLE study_sets (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid REFERENCES auth.users NOT NULL,
  subject_id          uuid REFERENCES subjects(id) ON DELETE SET NULL,
  name                text NOT NULL,
  file_name           text NOT NULL,
  file_type           text NOT NULL,
  extracted_text_path text NOT NULL,
  generation_status   text NOT NULL DEFAULT 'pending'
                      CHECK (generation_status IN ('pending','processing','done','error')),
  last_studied_at     timestamptz,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON study_sets
  FOR EACH ROW EXECUTE PROCEDURE moddatetime(updated_at);

-- questions
CREATE TABLE questions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_set_id   uuid REFERENCES study_sets(id) ON DELETE CASCADE NOT NULL,
  type           text NOT NULL CHECK (type IN ('mcq','short_answer')),
  question_text  text NOT NULL,
  options        jsonb,
  correct_answer text NOT NULL,
  created_at     timestamptz DEFAULT now()
);

-- question_state (current SM-2 state, one row per user+question)
CREATE TABLE question_state (
  user_id     uuid REFERENCES auth.users NOT NULL,
  question_id uuid REFERENCES questions(id) ON DELETE CASCADE NOT NULL,
  ease_factor float NOT NULL DEFAULT 2.5,
  interval    int NOT NULL DEFAULT 1,
  repetitions int NOT NULL DEFAULT 0,
  next_review timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, question_id)
);

-- answer_log (append-only history)
CREATE TABLE answer_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users NOT NULL,
  question_id uuid REFERENCES questions(id) ON DELETE CASCADE NOT NULL,
  answer_given text NOT NULL,
  is_correct  boolean NOT NULL,
  answered_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE subjects      ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_sets    ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE answer_log    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user owns subjects"       ON subjects      USING (user_id = auth.uid());
CREATE POLICY "user owns study_sets"     ON study_sets    USING (user_id = auth.uid());
CREATE POLICY "user accesses own questions" ON questions
  USING (study_set_id IN (SELECT id FROM study_sets WHERE user_id = auth.uid()));
CREATE POLICY "user owns question_state" ON question_state USING (user_id = auth.uid());
CREATE POLICY "user owns answer_log"     ON answer_log    USING (user_id = auth.uid());

-- Storage bucket policy (run after creating 'study-files' bucket in dashboard)
CREATE POLICY "users access own files" ON storage.objects
  FOR ALL USING (
    bucket_id = 'study-files'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
```

- [ ] **Step 3: Create `lib/supabase/client.ts`**

```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **Step 4: Create `lib/supabase/server.ts`**

```typescript
import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

// Use in Server Components and API routes that respect RLS
export function createClient() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}

// Use in API routes that need to bypass RLS (e.g., inserting questions)
export function createServiceRoleClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
```

- [ ] **Step 5: Create Supabase project and run migration**

1. Go to supabase.com → New project
2. Copy project URL + keys into `.env.local`
3. Create `study-files` storage bucket (private) in Supabase Dashboard → Storage
4. Run: `npx supabase db push` (or paste the SQL into the Supabase SQL editor)

- [ ] **Step 6: Commit**

```bash
git add supabase/ lib/supabase/
git commit -m "feat: add database migration and Supabase client utilities"
```

---

## Task 4: SM-2 Algorithm (TDD)

**Files:**
- Create: `lib/spaced-repetition/sm2.ts`
- Create: `__tests__/lib/sm2.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/lib/sm2.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { updateSM2 } from '@/lib/spaced-repetition/sm2'

describe('updateSM2', () => {
  const defaults = { easeFactor: 2.5, interval: 1, repetitions: 0 }

  it('first correct answer sets interval to 1 day', () => {
    const result = updateSM2({ quality: 5, ...defaults })
    expect(result.interval).toBe(1)
    expect(result.repetitions).toBe(1)
  })

  it('second correct answer sets interval to 6 days', () => {
    const result = updateSM2({ quality: 5, easeFactor: 2.5, interval: 1, repetitions: 1 })
    expect(result.interval).toBe(6)
    expect(result.repetitions).toBe(2)
  })

  it('third correct answer multiplies interval by ease factor', () => {
    const result = updateSM2({ quality: 5, easeFactor: 2.5, interval: 6, repetitions: 2 })
    expect(result.interval).toBe(15) // round(6 * 2.5)
  })

  it('failing answer resets interval to 1 and repetitions to 0', () => {
    const result = updateSM2({ quality: 1, easeFactor: 2.5, interval: 6, repetitions: 2 })
    expect(result.interval).toBe(1)
    expect(result.repetitions).toBe(0)
  })

  it('ease factor never drops below 1.3', () => {
    const result = updateSM2({ quality: 0, easeFactor: 1.3, interval: 1, repetitions: 0 })
    expect(result.easeFactor).toBeGreaterThanOrEqual(1.3)
  })

  it('nextReview is in the future', () => {
    const result = updateSM2({ quality: 4, ...defaults })
    expect(result.nextReview.getTime()).toBeGreaterThan(Date.now())
  })
})
```

- [ ] **Step 2: Run — confirm all tests fail**

```bash
npm test -- __tests__/lib/sm2.test.ts
```
Expected: `FAIL` — `Cannot find module '@/lib/spaced-repetition/sm2'`

- [ ] **Step 3: Implement `lib/spaced-repetition/sm2.ts`**

```typescript
import type { SM2Input, SM2Result } from '@/types'

export function updateSM2({ quality, easeFactor, interval, repetitions }: SM2Input): SM2Result {
  let newEF = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
  if (newEF < 1.3) newEF = 1.3

  let newInterval: number
  let newRepetitions: number

  if (quality < 3) {
    newInterval = 1
    newRepetitions = 0
  } else {
    newRepetitions = repetitions + 1
    if (repetitions === 0)      newInterval = 1
    else if (repetitions === 1) newInterval = 6
    else                        newInterval = Math.round(interval * newEF)
  }

  const nextReview = new Date()
  nextReview.setDate(nextReview.getDate() + newInterval)

  return { easeFactor: newEF, interval: newInterval, repetitions: newRepetitions, nextReview }
}
```

- [ ] **Step 4: Run — confirm all tests pass**

```bash
npm test -- __tests__/lib/sm2.test.ts
```
Expected: `PASS` (6 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/spaced-repetition/sm2.ts __tests__/lib/sm2.test.ts
git commit -m "feat: implement SM-2 spaced repetition algorithm with tests"
```

---

## Task 5: Text Utilities (TDD)

**Files:**
- Create: `lib/ai/chunk-text.ts`
- Create: `__tests__/lib/chunk-text.test.ts`
- Create: `__tests__/lib/grade-short-answer.test.ts`

Note: `gradeShortAnswer` lives in its own file `lib/ai/grade-short-answer.ts` and is exported for testing.

- [ ] **Step 1: Write failing tests for `chunkText`**

Create `__tests__/lib/chunk-text.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { chunkText } from '@/lib/ai/chunk-text'

describe('chunkText', () => {
  it('returns single chunk when text is under limit', () => {
    const result = chunkText('hello world', 100)
    expect(result).toEqual(['hello world'])
  })

  it('splits text into multiple chunks under maxChars', () => {
    const long = 'word '.repeat(200) // 1000 chars
    const result = chunkText(long, 300)
    expect(result.length).toBeGreaterThan(1)
    result.forEach(chunk => expect(chunk.length).toBeLessThanOrEqual(310))
  })

  it('all content is preserved (no data loss)', () => {
    const long = 'abcde '.repeat(500)
    const chunks = chunkText(long, 400)
    const rejoined = chunks.join(' ')
    expect(rejoined.replace(/\s+/g, ' ').trim()).toBe(long.trim())
  })

  it('caps total input at MAX_INPUT_CHARS', () => {
    const huge = 'x'.repeat(20000)
    const chunks = chunkText(huge, 3000, 15000)
    const total = chunks.reduce((s, c) => s + c.length, 0)
    expect(total).toBeLessThanOrEqual(15000)
  })
})
```

- [ ] **Step 2: Write failing tests for `gradeShortAnswer`**

Create `__tests__/lib/grade-short-answer.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { gradeShortAnswer } from '@/lib/ai/grade-short-answer'

describe('gradeShortAnswer', () => {
  it('exact match returns true', () => {
    expect(gradeShortAnswer('mitochondria', 'mitochondria')).toBe(true)
  })

  it('case insensitive', () => {
    expect(gradeShortAnswer('Mitochondria', 'mitochondria')).toBe(true)
  })

  it('ignores leading/trailing whitespace', () => {
    expect(gradeShortAnswer('  mitochondria  ', 'mitochondria')).toBe(true)
  })

  it('ignores punctuation', () => {
    expect(gradeShortAnswer('mitochondria.', 'mitochondria')).toBe(true)
  })

  it('wrong answer returns false', () => {
    expect(gradeShortAnswer('nucleus', 'mitochondria')).toBe(false)
  })

  it('synonym/different phrasing returns false (known limitation)', () => {
    expect(gradeShortAnswer('the mitochondria', 'mitochondria')).toBe(false)
  })
})
```

- [ ] **Step 3: Run — confirm tests fail**

```bash
npm test -- __tests__/lib/chunk-text.test.ts __tests__/lib/grade-short-answer.test.ts
```

- [ ] **Step 4: Implement `lib/ai/chunk-text.ts`**

```typescript
export const MAX_INPUT_CHARS = 15000

export function chunkText(text: string, maxChars = 3000, maxTotal = MAX_INPUT_CHARS): string[] {
  const capped = text.slice(0, maxTotal)
  if (capped.length <= maxChars) return [capped]

  const chunks: string[] = []
  let remaining = capped

  while (remaining.length > 0) {
    if (remaining.length <= maxChars) {
      chunks.push(remaining)
      break
    }
    let bp = remaining.lastIndexOf('.', maxChars)
    if (bp === -1 || bp < maxChars * 0.5) bp = remaining.lastIndexOf(' ', maxChars)
    if (bp === -1) bp = maxChars
    chunks.push(remaining.slice(0, bp + 1).trim())
    remaining = remaining.slice(bp + 1).trim()
  }

  return chunks
}
```

- [ ] **Step 4b: Create `lib/ai/grade-short-answer.ts`**

```typescript
export function gradeShortAnswer(given: string, correct: string): boolean {
  const n = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ')
  return n(given) === n(correct)
}
```

- [ ] **Step 5: Run — confirm all tests pass**

```bash
npm test -- __tests__/lib/chunk-text.test.ts __tests__/lib/grade-short-answer.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add lib/ai/chunk-text.ts __tests__/lib/
git commit -m "feat: add chunkText and gradeShortAnswer utilities with tests"
```

---

## Task 6: File Parsers (TDD)

**Files:**
- Create: `lib/parsers/txt.ts`, `pdf.ts`, `docx.ts`, `pptx.ts`, `markdown.ts`, `index.ts`
- Create: `__tests__/lib/parsers.test.ts`

- [ ] **Step 1: Write failing parser tests**

Create `__tests__/lib/parsers.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { getParser } from '@/lib/parsers/index'

describe('getParser', () => {
  it('returns parser for pdf', () => expect(getParser('application/pdf')).toBeDefined())
  it('returns parser for txt', () => expect(getParser('text/plain')).toBeDefined())
  it('returns parser for docx', () => expect(getParser('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBeDefined())
  it('returns parser for pptx', () => expect(getParser('application/vnd.openxmlformats-officedocument.presentationml.presentation')).toBeDefined())
  it('returns parser for markdown', () => expect(getParser('text/markdown')).toBeDefined())
  it('returns null for unsupported type', () => expect(getParser('video/mp4')).toBeNull())
})

describe('parser output', () => {
  it('parseTxt returns content as string', async () => {
    const { parseTxt } = await import('@/lib/parsers/txt')
    const buf = Buffer.from('Hello world')
    const result = await parseTxt(buf)
    expect(result).toBe('Hello world')
  })

  it('parseMarkdown strips HTML tags', async () => {
    const { parseMarkdown } = await import('@/lib/parsers/markdown')
    const buf = Buffer.from('# Hello\n\nWorld paragraph.')
    const result = await parseMarkdown(buf)
    expect(result).not.toContain('<h1>')
    expect(result).toContain('Hello')
    expect(result).toContain('World')
  })
})
```

- [ ] **Step 2: Run — confirm tests fail**

```bash
npm test -- __tests__/lib/parsers.test.ts
```

- [ ] **Step 3: Implement parsers**

`lib/parsers/txt.ts`:
```typescript
export async function parseTxt(buffer: Buffer): Promise<string> {
  return buffer.toString('utf-8')
}
```

`lib/parsers/pdf.ts`:
```typescript
import pdfParse from 'pdf-parse'
export async function parsePdf(buffer: Buffer): Promise<string> {
  const result = await pdfParse(buffer)
  return result.text
}
```

`lib/parsers/docx.ts`:
```typescript
import officeParser from 'officeparser'
export async function parseDocx(buffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    officeParser.parseOfficeAsync(buffer, { outputErrorToConsole: false })
      .then(resolve).catch(reject)
  })
}
```

`lib/parsers/pptx.ts`:
```typescript
import officeParser from 'officeparser'
export async function parsePptx(buffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    officeParser.parseOfficeAsync(buffer, { outputErrorToConsole: false })
      .then(resolve).catch(reject)
  })
}
```

`lib/parsers/markdown.ts`:
```typescript
import { marked } from 'marked'
export async function parseMarkdown(buffer: Buffer): Promise<string> {
  const html = await marked(buffer.toString('utf-8'))
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}
```

`lib/parsers/index.ts`:
```typescript
import { parsePdf } from './pdf'
import { parseTxt } from './txt'
import { parseDocx } from './docx'
import { parsePptx } from './pptx'
import { parseMarkdown } from './markdown'

const PARSERS: Record<string, (buf: Buffer) => Promise<string>> = {
  'application/pdf': parsePdf,
  'text/plain': parseTxt,
  'text/markdown': parseMarkdown,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': parseDocx,
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': parsePptx,
}

export const SUPPORTED_TYPES = Object.keys(PARSERS)

export function getParser(mimeType: string) {
  return PARSERS[mimeType] ?? null
}

export async function parseFile(buffer: Buffer, mimeType: string): Promise<string> {
  const parser = getParser(mimeType)
  if (!parser) throw new Error(`Unsupported file type: ${mimeType}`)
  const text = await parser(buffer)
  if (!text.trim()) throw new Error('Could not extract text from this file')
  return text
}
```

- [ ] **Step 4: Run — confirm tests pass**

```bash
npm test -- __tests__/lib/parsers.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/parsers/ __tests__/lib/parsers.test.ts
git commit -m "feat: add file parsers for PDF, DOCX, PPTX, MD, TXT"
```

---

## Task 7: DeepSeek AI Library

**Files:**
- Create: `lib/ai/generate-questions.ts`
- Create: `lib/ai/get-feedback.ts`

- [ ] **Step 1: Create `lib/ai/generate-questions.ts`**

```typescript
import OpenAI from 'openai'
import { chunkText } from './chunk-text'
import type { Question } from '@/types'

const ai = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com',
})

const SYSTEM_PROMPT = `You are a study assistant that generates quiz questions from educational text.
Always respond with valid JSON only — no explanation, no markdown, no code fences.`

async function generateFromChunk(
  chunk: string,
  studySetId: string,
  n: number,
  retries = 1
): Promise<Omit<Question, 'id' | 'created_at'>[]> {
  const userPrompt = `Generate ${n} quiz questions from the text below.
Return a JSON array where each object has:
  - "type": "mcq" or "short_answer"
  - "question_text": string
  - "options": array of {label, text} for MCQ (labels "A","B","C","D"), null for short_answer
  - "correct_answer": for MCQ, the label ("A","B","C","D"); for short_answer, a single word or short phrase (max 5 words) for exact matching

Distribute types: 70% mcq, 30% short_answer.
For short_answer, correct_answer MUST be terse (1-5 words) to enable exact string matching.

Text:
${chunk}`

  try {
    const res = await ai.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
    })
    const raw = res.choices[0].message.content ?? '[]'
    const parsed: any[] = JSON.parse(raw)
    return parsed.map(q => ({
      study_set_id: studySetId,
      type: q.type,
      question_text: q.question_text,
      options: q.options ?? null,
      correct_answer: q.correct_answer,
    }))
  } catch {
    if (retries > 0) return generateFromChunk(chunk, studySetId, n, retries - 1)
    throw new Error('Failed to generate questions after retry')
  }
}

export async function generateQuestions(
  text: string,
  studySetId: string
): Promise<Omit<Question, 'id' | 'created_at'>[]> {
  const chunks = chunkText(text)
  const all: Omit<Question, 'id' | 'created_at'>[] = []
  for (const chunk of chunks) {
    const n = Math.max(5, Math.round(10 * (chunk.length / 3000)))
    const questions = await generateFromChunk(chunk, studySetId, n)
    all.push(...questions)
  }
  return all
}
```

- [ ] **Step 2: Create `lib/ai/get-feedback.ts`**

```typescript
import OpenAI from 'openai'

const ai = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com',
})

export async function getFeedback(
  questionText: string,
  correctAnswer: string,
  answerGiven: string,
  isCorrect: boolean
): Promise<string> {
  const res = await ai.chat.completions.create({
    model: 'deepseek-chat',
    messages: [
      {
        role: 'system',
        content: 'You are a supportive study tutor. Respond with plain text only — no markdown, no bullet points.',
      },
      {
        role: 'user',
        content: `A student answered a study question.
Question: ${questionText}
Correct answer: ${correctAnswer}
Student's answer: ${answerGiven}
Result: ${isCorrect ? 'correct' : 'incorrect'}

In 2-3 sentences, explain why the correct answer is right. If the student was wrong, address their specific misconception without being discouraging.`,
      },
    ],
    temperature: 0.5,
  })
  return res.choices[0].message.content ?? ''
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/ai/generate-questions.ts lib/ai/get-feedback.ts
git commit -m "feat: add DeepSeek AI library for question generation and feedback"
```

---

## Task 8: Authentication

**Files:**
- Create: `middleware.ts`
- Create: `app/(auth)/login/page.tsx`
- Create: `app/(auth)/register/page.tsx`

- [ ] **Step 1: Create `middleware.ts`**

```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const isAuthPage = /^\/(login|register)/.test(request.nextUrl.pathname)

  if (!user && !isAuthPage) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  if (user && isAuthPage) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return response
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
```

- [ ] **Step 2: Create `app/(auth)/login/page.tsx`**

```typescript
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false) }
    else router.push('/dashboard')
  }

  return (
    <main className="min-h-screen flex items-center justify-center"
      style={{ background: 'radial-gradient(ellipse at 50% 0%, #0d1f3c 0%, var(--bg-base) 70%)' }}>
      <div className="w-full max-w-sm p-8 rounded-2xl border"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--bg-border)' }}>
        <h1 className="font-display text-3xl font-bold mb-2" style={{ color: 'var(--accent-cyan)' }}>
          SmartStudy
        </h1>
        <p className="text-sm mb-8" style={{ color: 'var(--text-muted)' }}>Sign in to your account</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email" required value={email} onChange={e => setEmail(e.target.value)}
            placeholder="Email" className="w-full px-4 py-3 rounded-lg text-sm outline-none"
            style={{ background: 'var(--bg-base)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)' }}
          />
          <input
            type="password" required value={password} onChange={e => setPassword(e.target.value)}
            placeholder="Password" className="w-full px-4 py-3 rounded-lg text-sm outline-none"
            style={{ background: 'var(--bg-base)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)' }}
          />
          {error && <p className="text-sm" style={{ color: 'var(--error)' }}>{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full py-3 rounded-lg font-display font-semibold text-sm transition-opacity disabled:opacity-50"
            style={{ background: 'var(--accent-cyan)', color: 'var(--bg-base)' }}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
        <p className="text-center text-sm mt-6" style={{ color: 'var(--text-muted)' }}>
          No account?{' '}
          <Link href="/register" style={{ color: 'var(--accent-cyan)' }}>Register</Link>
        </p>
      </div>
    </main>
  )
}
```

- [ ] **Step 3: Create `app/(auth)/register/page.tsx`**

Same structure as login, but call `supabase.auth.signUp({ email, password })`. Show "Check your email to confirm your account" on success instead of redirecting.

```typescript
'use client'
import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) { setError(error.message); setLoading(false) }
    else setDone(true)
  }

  if (done) return (
    <main className="min-h-screen flex items-center justify-center"
      style={{ background: 'radial-gradient(ellipse at 50% 0%, #0d1f3c 0%, var(--bg-base) 70%)' }}>
      <div className="w-full max-w-sm p-8 rounded-2xl border text-center"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--bg-border)' }}>
        <h2 className="font-display text-xl font-bold mb-2">Check your email</h2>
        <p style={{ color: 'var(--text-muted)' }}>We sent a confirmation link to <strong>{email}</strong>.</p>
        <Link href="/login" className="block mt-6 text-sm" style={{ color: 'var(--accent-cyan)' }}>
          Back to login
        </Link>
      </div>
    </main>
  )

  return (
    <main className="min-h-screen flex items-center justify-center"
      style={{ background: 'radial-gradient(ellipse at 50% 0%, #0d1f3c 0%, var(--bg-base) 70%)' }}>
      <div className="w-full max-w-sm p-8 rounded-2xl border"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--bg-border)' }}>
        <h1 className="font-display text-3xl font-bold mb-2" style={{ color: 'var(--accent-cyan)' }}>
          SmartStudy
        </h1>
        <p className="text-sm mb-8" style={{ color: 'var(--text-muted)' }}>Create your account</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
            placeholder="Email" className="w-full px-4 py-3 rounded-lg text-sm outline-none"
            style={{ background: 'var(--bg-base)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)' }} />
          <input type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)}
            placeholder="Password (min 6 chars)" className="w-full px-4 py-3 rounded-lg text-sm outline-none"
            style={{ background: 'var(--bg-base)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)' }} />
          {error && <p className="text-sm" style={{ color: 'var(--error)' }}>{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full py-3 rounded-lg font-display font-semibold text-sm disabled:opacity-50"
            style={{ background: 'var(--accent-cyan)', color: 'var(--bg-base)' }}>
            {loading ? 'Creating account…' : 'Create Account'}
          </button>
        </form>
        <p className="text-center text-sm mt-6" style={{ color: 'var(--text-muted)' }}>
          Have an account? <Link href="/login" style={{ color: 'var(--accent-cyan)' }}>Sign in</Link>
        </p>
      </div>
    </main>
  )
}
```

- [ ] **Step 4: Add root redirect `app/page.tsx`**

```typescript
import { redirect } from 'next/navigation'
export default function RootPage() { redirect('/dashboard') }
```

- [ ] **Step 5: Manually test auth flow**

Run `npm run dev`, navigate to `http://localhost:3000`. Should redirect to `/login`. Register an account, confirm email, log in, get redirected to `/dashboard` (404 for now — that's fine).

- [ ] **Step 6: Commit**

```bash
git add middleware.ts app/
git commit -m "feat: add authentication with Supabase Auth and route protection"
```

---

## Task 9: Upload API Route

**Files:**
- Create: `app/api/upload/route.ts`

- [ ] **Step 1: Create `app/api/upload/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { parseFile, SUPPORTED_TYPES } from '@/lib/parsers/index'

const MAX_SIZE = 50 * 1024 * 1024 // 50MB

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const name = formData.get('name') as string | null
  const subjectId = formData.get('subjectId') as string | null

  if (!file || !name) return NextResponse.json({ error: 'Missing file or name' }, { status: 400 })
  if (file.size > MAX_SIZE) return NextResponse.json({ error: 'File too large (max 50MB)' }, { status: 400 })
  if (!SUPPORTED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: `Unsupported file type: ${file.type}` }, { status: 400 })
  }

  let extractedText: string
  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    extractedText = await parseFile(buffer, file.type)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 422 })
  }

  // Generate a study set ID upfront so we can name the storage file
  const studySetId = crypto.randomUUID()
  const storagePath = `${user.id}/${studySetId}.txt`

  const service = createServiceRoleClient()

  // Upload .txt sidecar
  const { error: storageError } = await service.storage
    .from('study-files')
    .upload(storagePath, Buffer.from(extractedText, 'utf-8'), { contentType: 'text/plain' })
  if (storageError) return NextResponse.json({ error: 'Storage upload failed' }, { status: 500 })

  // Insert study_set row
  const { error: dbError } = await service.from('study_sets').insert({
    id: studySetId,
    user_id: user.id,
    subject_id: subjectId || null,
    name,
    file_name: file.name,
    file_type: file.type,
    extracted_text_path: storagePath,
    generation_status: 'pending',
  })
  if (dbError) return NextResponse.json({ error: 'Database insert failed' }, { status: 500 })

  return NextResponse.json({ studySetId })
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/upload/
git commit -m "feat: add upload API route — parse file and store text sidecar"
```

---

## Task 10: Generate API Routes

**Files:**
- Create: `app/api/generate/route.ts`
- Create: `app/api/generate/status/[id]/route.ts`

- [ ] **Step 1: Create `app/api/generate/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { generateQuestions } from '@/lib/ai/generate-questions'

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { studySetId } = await request.json()
  if (!studySetId) return NextResponse.json({ error: 'Missing studySetId' }, { status: 400 })

  const service = createServiceRoleClient()

  // Verify ownership
  const { data: studySet } = await service.from('study_sets')
    .select('id, user_id, extracted_text_path, generation_status')
    .eq('id', studySetId).single()

  if (!studySet || studySet.user_id !== user.id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (studySet.generation_status === 'done')
    return NextResponse.json({ ok: true, message: 'Already generated' })

  // Mark processing
  await service.from('study_sets').update({ generation_status: 'processing' }).eq('id', studySetId)

  try {
    // Download .txt sidecar
    const { data: fileData, error: dlError } = await service.storage
      .from('study-files').download(studySet.extracted_text_path)
    if (dlError || !fileData) throw new Error('Failed to download text sidecar')

    const text = await fileData.text()

    // Generate questions
    const questions = await generateQuestions(text, studySetId)

    // Bulk insert
    if (questions.length > 0) {
      const { error: insertError } = await service.from('questions').insert(questions)
      if (insertError) throw new Error('Failed to insert questions')
    }

    await service.from('study_sets').update({ generation_status: 'done' }).eq('id', studySetId)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    await service.from('study_sets').update({ generation_status: 'error' }).eq('id', studySetId)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
```

- [ ] **Step 2: Create `app/api/generate/status/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: studySet } = await supabase.from('study_sets')
    .select('id, user_id, generation_status').eq('id', params.id).single()

  if (!studySet || studySet.user_id !== user.id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const service = createServiceRoleClient()
  const { count } = await service.from('questions')
    .select('*', { count: 'exact', head: true }).eq('study_set_id', params.id)

  return NextResponse.json({ status: studySet.generation_status, questionCount: count ?? 0 })
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/generate/
git commit -m "feat: add question generation API routes"
```

---

## Task 11: Session & Feedback API Routes

**Files:**
- Create: `app/api/session/next/route.ts`
- Create: `app/api/session/answer/route.ts`
- Create: `app/api/feedback/route.ts`

- [ ] **Step 1: Create `app/api/session/next/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const studySetId = request.nextUrl.searchParams.get('studySetId')
  if (!studySetId) return NextResponse.json({ error: 'Missing studySetId' }, { status: 400 })

  const userId = user.id

  // 1. Due for review
  const { data: rpcResult } = await supabase.rpc('get_next_question_due', { p_study_set_id: studySetId, p_user_id: userId })
  let question = Array.isArray(rpcResult) ? (rpcResult[0] ?? null) : (rpcResult ?? null)
  if (!question) {
    // 2. Never attempted
    const { data } = await supabase
      .from('questions')
      .select('*, question_state!left(question_id)')
      .eq('study_set_id', studySetId)
      .is('question_state.question_id', null)
      .limit(1)
      .single()
    question = data
  }
  if (!question) {
    // 3. Weakness targeting
    const { data } = await supabase
      .from('question_state')
      .select('question_id, ease_factor, questions(*)')
      .eq('user_id', userId)
      .order('ease_factor', { ascending: true })
      .limit(1)
      .single()
    question = data?.questions ?? null
  }

  if (!question) return NextResponse.json({ done: true })
  return NextResponse.json({ question })
}
```

> **Note on RPC:** The "due for review" query is best implemented as a Supabase RPC function. Add this to migrations:
>
> ```sql
> CREATE OR REPLACE FUNCTION get_next_question_due(p_study_set_id uuid, p_user_id uuid)
> RETURNS SETOF questions AS $$
>   SELECT q.* FROM questions q
>   JOIN question_state qs ON qs.question_id = q.id AND qs.user_id = p_user_id
>   WHERE q.study_set_id = p_study_set_id AND qs.next_review <= now()
>   ORDER BY qs.next_review ASC LIMIT 1;
> $$ LANGUAGE sql SECURITY DEFINER SET search_path = '';
> ```
> Add this function to the migration file.

- [ ] **Step 2: Create `app/api/session/answer/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { updateSM2 } from '@/lib/spaced-repetition/sm2'

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { questionId, answerGiven, isCorrect: clientIsCorrect, smQuality } = await request.json()
  const service = createServiceRoleClient()

  // Fetch question to validate MCQ answer server-side
  const { data: question } = await service.from('questions').select('*').eq('id', questionId).single()
  if (!question) return NextResponse.json({ error: 'Question not found' }, { status: 404 })

  let isCorrect = clientIsCorrect
  if (question.type === 'mcq') {
    isCorrect = question.correct_answer === answerGiven
  }

  // Append to answer_log
  await service.from('answer_log').insert({
    user_id: user.id, question_id: questionId, answer_given: answerGiven, is_correct: isCorrect,
  })

  // Get current SM-2 state
  const { data: state } = await service.from('question_state')
    .select('*').eq('user_id', user.id).eq('question_id', questionId).single()

  const sm2Result = updateSM2({
    quality: smQuality,
    easeFactor: state?.ease_factor ?? 2.5,
    interval: state?.interval ?? 1,
    repetitions: state?.repetitions ?? 0,
  })

  // Upsert SM-2 state
  await service.from('question_state').upsert({
    user_id: user.id,
    question_id: questionId,
    ease_factor: sm2Result.easeFactor,
    interval: sm2Result.interval,
    repetitions: sm2Result.repetitions,
    next_review: sm2Result.nextReview.toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,question_id' })

  // Update last_studied_at on parent study set
  await service.from('study_sets')
    .update({ last_studied_at: new Date().toISOString() })
    .eq('id', question.study_set_id)

  return NextResponse.json({ updated: true, isCorrect })
}
```

- [ ] **Step 3: Create `app/api/feedback/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getFeedback } from '@/lib/ai/get-feedback'

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { questionText, correctAnswer, answerGiven, isCorrect } = await request.json()
  const feedback = await getFeedback(questionText, correctAnswer, answerGiven, isCorrect)
  return NextResponse.json({ feedback })
}
```

- [ ] **Step 4: Add the RPC function to migrations**

Open `supabase/migrations/20260322000000_initial_schema.sql` and append:

```sql
CREATE OR REPLACE FUNCTION get_next_question_due(p_study_set_id uuid, p_user_id uuid)
RETURNS SETOF questions AS $$
  SELECT q.* FROM questions q
  JOIN question_state qs ON qs.question_id = q.id AND qs.user_id = p_user_id
  WHERE q.study_set_id = p_study_set_id AND qs.next_review <= now()
  ORDER BY qs.next_review ASC LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = '';
```

- [ ] **Step 5: Re-run migrations**

```bash
npx supabase db push
```

- [ ] **Step 6: Commit**

```bash
git add app/api/session/ app/api/feedback/ supabase/
git commit -m "feat: add session and feedback API routes"
```

---

## Task 12: UI Primitives

**Files:**
- Create: `components/ui/Button.tsx`, `Card.tsx`, `Badge.tsx`, `Input.tsx`, `Modal.tsx`, `Spinner.tsx`, `ProgressBar.tsx`, `ProgressRing.tsx`

- [ ] **Step 1: Create `components/ui/Button.tsx`**

```typescript
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
}

export function Button({ variant = 'primary', size = 'md', className = '', ...props }: ButtonProps) {
  const base = 'inline-flex items-center justify-center font-display font-semibold rounded-lg transition-all disabled:opacity-50 cursor-pointer'
  const sizes = { sm: 'px-3 py-1.5 text-xs', md: 'px-5 py-2.5 text-sm' }
  const variants = {
    primary: 'hover:opacity-90 active:scale-95',
    ghost: 'border hover:bg-white/5',
    danger: 'hover:opacity-90',
  }
  const styles = {
    primary: { background: 'var(--accent-cyan)', color: 'var(--bg-base)' },
    ghost: { borderColor: 'var(--bg-border)', color: 'var(--text-primary)' },
    danger: { background: 'var(--error)', color: '#fff' },
  }
  return (
    <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
      style={styles[variant]} {...props} />
  )
}
```

- [ ] **Step 2: Create `components/ui/Card.tsx`**

```typescript
export function Card({ className = '', children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`rounded-2xl border p-6 ${className}`}
      style={{ background: 'var(--bg-surface)', borderColor: 'var(--bg-border)' }}
      {...props}>
      {children}
    </div>
  )
}
```

- [ ] **Step 3: Create `components/ui/Badge.tsx`**

```typescript
interface BadgeProps { label: string; color?: string }
export function Badge({ label, color = 'var(--accent-cyan)' }: BadgeProps) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold"
      style={{ background: color + '22', color }}>
      {label}
    </span>
  )
}
```

- [ ] **Step 4: Create `components/ui/Spinner.tsx`**

```typescript
export function Spinner({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="animate-spin"
      style={{ color: 'var(--accent-cyan)' }}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"
        fill="none" strokeDasharray="31.4" strokeDashoffset="10" strokeLinecap="round" />
    </svg>
  )
}
```

- [ ] **Step 5: Create `components/ui/ProgressBar.tsx`**

```typescript
export function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = Math.round((value / max) * 100)
  return (
    <div className="w-full h-2 rounded-full" style={{ background: 'var(--bg-border)' }}>
      <div className="h-2 rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, background: 'var(--accent-cyan)' }} />
    </div>
  )
}
```

- [ ] **Step 6: Create `components/ui/ProgressRing.tsx`**

```typescript
export function ProgressRing({ value, max, size = 56 }: { value: number; max: number; size?: number }) {
  const r = (size - 8) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (value / max) * circ
  return (
    <svg width={size} height={size}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--bg-border)" strokeWidth="4" />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--accent-cyan)" strokeWidth="4"
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round" transform={`rotate(-90 ${size/2} ${size/2})`}
        style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
        style={{ fontSize: size * 0.22, fill: 'var(--text-primary)', fontFamily: 'var(--font-display)', fontWeight: 700 }}>
        {max > 0 ? Math.round((value/max)*100) : 0}%
      </text>
    </svg>
  )
}
```

- [ ] **Step 7: Create `components/ui/Input.tsx`**

```typescript
export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input className="w-full px-4 py-3 rounded-lg text-sm outline-none transition-colors"
      style={{ background: 'var(--bg-base)', border: '1px solid var(--bg-border)',
               color: 'var(--text-primary)' }}
      onFocus={e => (e.target.style.borderColor = 'var(--accent-cyan)')}
      onBlur={e => (e.target.style.borderColor = 'var(--bg-border)')}
      {...props} />
  )
}
```

- [ ] **Step 8: Create `components/ui/Modal.tsx`**

```typescript
'use client'
import { useEffect } from 'react'
import { Card } from './Card'

interface ModalProps { open: boolean; onClose: () => void; children: React.ReactNode; title: string }

export function Modal({ open, onClose, children, title }: ModalProps) {
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
  }, [open])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <Card className="w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-display font-bold text-lg">{title}</h2>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }} className="text-xl leading-none">×</button>
        </div>
        {children}
      </Card>
    </div>
  )
}
```

- [ ] **Step 9: Commit**

```bash
git add components/ui/
git commit -m "feat: add UI primitive components"
```

---

## Task 13: Dashboard

**Files:**
- Create: `hooks/useStudySets.ts`
- Create: `components/dashboard/StudySetCard.tsx`
- Create: `components/dashboard/RenameInput.tsx`
- Create: `components/dashboard/SubjectGroup.tsx`
- Create: `app/dashboard/page.tsx`

- [ ] **Step 1: Create `hooks/useStudySets.ts`**

```typescript
'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { StudySet, Subject } from '@/types'

export function useStudySets() {
  const [studySets, setStudySets] = useState<StudySet[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    const supabase = createClient()
    const [{ data: sets }, { data: subs }] = await Promise.all([
      supabase.from('study_sets').select('*, subject:subjects(*)').order('created_at', { ascending: false }),
      supabase.from('subjects').select('*').order('name'),
    ])
    // Attach question_count via separate query for each set
    if (sets) {
      const withCounts = await Promise.all(sets.map(async (s) => {
        const { count } = await supabase.from('questions')
          .select('*', { count: 'exact', head: true }).eq('study_set_id', s.id)
        return { ...s, question_count: count ?? 0 }
      }))
      setStudySets(withCounts)
    }
    if (subs) setSubjects(subs)
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  async function renameSet(id: string, name: string) {
    const supabase = createClient()
    await supabase.from('study_sets').update({ name }).eq('id', id)
    setStudySets(prev => prev.map(s => s.id === id ? { ...s, name } : s))
  }

  async function deleteSet(id: string) {
    const supabase = createClient()
    await supabase.from('study_sets').delete().eq('id', id)
    setStudySets(prev => prev.filter(s => s.id !== id))
  }

  async function assignSubject(id: string, subjectId: string | null) {
    const supabase = createClient()
    await supabase.from('study_sets').update({ subject_id: subjectId }).eq('id', id)
    await fetch()
  }

  async function refreshSet(id: string) {
    const supabase = createClient()
    await supabase.from('study_sets').update({ generation_status: 'pending' }).eq('id', id)
    // Re-trigger generation
    await window.fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studySetId: id }),
    })
    await fetch()
  }

  return { studySets, subjects, loading, renameSet, deleteSet, assignSubject, refreshSet, refresh: fetch }
}
```

- [ ] **Step 2: Create `components/dashboard/RenameInput.tsx`**

```typescript
'use client'
import { useState, useRef, useEffect } from 'react'

interface RenameInputProps { value: string; onSave: (name: string) => void }

export function RenameInput({ value, onSave }: RenameInputProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  function save() {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== value) onSave(trimmed)
    setEditing(false)
  }

  if (!editing) return (
    <span className="font-display font-semibold cursor-pointer hover:underline"
      onClick={() => setEditing(true)}>
      {value}
    </span>
  )
  return (
    <input ref={inputRef} value={draft} onChange={e => setDraft(e.target.value)}
      onBlur={save} onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
      className="font-display font-semibold bg-transparent outline-none border-b"
      style={{ borderColor: 'var(--accent-cyan)', color: 'var(--text-primary)', width: `${draft.length + 2}ch` }} />
  )
}
```

- [ ] **Step 3: Create `components/dashboard/StudySetCard.tsx`**

```typescript
'use client'
import Link from 'next/link'
import { Badge } from '@/components/ui/Badge'
import { ProgressRing } from '@/components/ui/ProgressRing'
import { RenameInput } from './RenameInput'
import type { StudySet, Subject } from '@/types'

const FILE_TYPE_LABELS: Record<string, string> = {
  'application/pdf': 'PDF',
  'text/plain': 'TXT',
  'text/markdown': 'MD',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PPTX',
}

interface Props {
  studySet: StudySet
  subjects: Subject[]
  onRename: (name: string) => void
  onDelete: () => void
  onRefresh: () => void
  onAssignSubject: (subjectId: string | null) => void
}

export function StudySetCard({ studySet, subjects, onRename, onDelete, onRefresh, onAssignSubject }: Props) {
  const mastery = studySet.question_count ? 0 : 0 // placeholder — mastery % requires performance data
  const lastStudied = studySet.last_studied_at
    ? new Date(studySet.last_studied_at).toLocaleDateString()
    : 'Never'

  return (
    <div className="rounded-xl border p-4 flex items-start gap-4 group"
      style={{ background: 'var(--bg-surface)', borderColor: 'var(--bg-border)' }}>
      <ProgressRing value={mastery} max={100} size={52} />
      <div className="flex-1 min-w-0">
        <RenameInput value={studySet.name} onSave={onRename} />
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <Badge label={FILE_TYPE_LABELS[studySet.file_type] ?? studySet.file_type} />
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {studySet.question_count} questions · Last studied {lastStudied}
          </span>
        </div>
        <select className="mt-2 text-xs rounded-md px-2 py-1"
          style={{ background: 'var(--bg-base)', border: '1px solid var(--bg-border)', color: 'var(--text-muted)' }}
          value={studySet.subject_id ?? ''}
          onChange={e => onAssignSubject(e.target.value || null)}>
          <option value="">Uncategorised</option>
          {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <div className="flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        {studySet.generation_status === 'done' && (
          <Link href={`/study/${studySet.id}`}
            className="px-3 py-1 rounded-lg text-xs font-semibold"
            style={{ background: 'var(--accent-cyan)', color: 'var(--bg-base)' }}>
            Study
          </Link>
        )}
        {studySet.generation_status === 'error' && (
          <span className="text-xs" style={{ color: 'var(--error)' }}>Generation failed</span>
        )}
        {studySet.generation_status === 'processing' && (
          <span className="text-xs" style={{ color: 'var(--accent-amber)' }}>Generating…</span>
        )}
        <button onClick={onRefresh} className="px-3 py-1 rounded-lg text-xs"
          style={{ color: 'var(--text-muted)', border: '1px solid var(--bg-border)' }}>
          Refresh
        </button>
        <button onClick={onDelete} className="px-3 py-1 rounded-lg text-xs"
          style={{ color: 'var(--error)', border: '1px solid var(--error)' }}>
          Delete
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create `components/dashboard/SubjectGroup.tsx`**

```typescript
'use client'
import { useState } from 'react'
import { StudySetCard } from './StudySetCard'
import type { StudySet, Subject } from '@/types'

interface Props {
  title: string
  color?: string
  studySets: StudySet[]
  subjects: Subject[]
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
  onAssignSubject: (id: string, subjectId: string | null) => void
}

export function SubjectGroup({ title, color, studySets, subjects, onRename, onDelete, onAssignSubject }: Props) {
  const [open, setOpen] = useState(true)
  if (studySets.length === 0) return null

  return (
    <section className="mb-8">
      <button className="flex items-center gap-2 mb-3 group" onClick={() => setOpen(o => !o)}>
        {color && <span className="w-3 h-3 rounded-full" style={{ background: color }} />}
        <h2 className="font-display font-bold text-lg">{title}</h2>
        <span style={{ color: 'var(--text-muted)' }} className="text-sm">({studySets.length})</span>
        <span style={{ color: 'var(--text-muted)' }}>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="space-y-3">
          {studySets.map(s => (
            <StudySetCard key={s.id} studySet={s} subjects={subjects}
              onRename={name => onRename(s.id, name)}
              onDelete={() => onDelete(s.id)}
              onAssignSubject={subjectId => onAssignSubject(s.id, subjectId)} />
          ))}
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 5: Create `app/dashboard/page.tsx`**

```typescript
'use client'
import Link from 'next/link'
import { useStudySets } from '@/hooks/useStudySets'
import { SubjectGroup } from '@/components/dashboard/SubjectGroup'
import { Spinner } from '@/components/ui/Spinner'
import { Button } from '@/components/ui/Button'

export default function DashboardPage() {
  const { studySets, subjects, loading, renameSet, deleteSet, assignSubject } = useStudySets()

  const grouped = subjects.map(sub => ({
    subject: sub,
    sets: studySets.filter(s => s.subject_id === sub.id),
  }))
  const uncategorised = studySets.filter(s => !s.subject_id)

  return (
    <main className="min-h-screen p-6 max-w-3xl mx-auto">
      <header className="flex items-center justify-between mb-10">
        <h1 className="font-display text-4xl font-extrabold" style={{ color: 'var(--accent-cyan)' }}>
          SmartStudy
        </h1>
        <div className="flex gap-3">
          <Link href="/settings"><Button variant="ghost" size="sm">Settings</Button></Link>
          <Link href="/upload"><Button size="sm">+ New Study Set</Button></Link>
        </div>
      </header>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner size={32} /></div>
      ) : studySets.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-lg mb-4" style={{ color: 'var(--text-muted)' }}>No study sets yet.</p>
          <Link href="/upload"><Button>Upload your first file</Button></Link>
        </div>
      ) : (
        <>
          {grouped.map(({ subject, sets }) => (
            <SubjectGroup key={subject.id} title={subject.name} color={subject.color}
              studySets={sets} subjects={subjects}
              onRename={renameSet} onDelete={deleteSet} onAssignSubject={assignSubject} />
          ))}
          <SubjectGroup title="Uncategorised" studySets={uncategorised} subjects={subjects}
            onRename={renameSet} onDelete={deleteSet} onAssignSubject={assignSubject} />
        </>
      )}
    </main>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add hooks/useStudySets.ts components/dashboard/ app/dashboard/
git commit -m "feat: add dashboard with subject groups and study set cards"
```

---

## Task 14: Upload Page

**Files:**
- Create: `components/upload/DropZone.tsx`
- Create: `components/upload/SubjectSelector.tsx`
- Create: `app/upload/page.tsx`

- [ ] **Step 1: Create `components/upload/DropZone.tsx`**

```typescript
'use client'
import { useRef, useState } from 'react'
import { SUPPORTED_TYPES } from '@/lib/parsers/index'

interface Props { onFile: (file: File) => void; disabled?: boolean }

const LABELS: Record<string, string> = {
  'application/pdf': 'PDF', 'text/plain': 'TXT', 'text/markdown': 'MD',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PPTX',
}

export function DropZone({ onFile, disabled }: Props) {
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function validate(file: File) {
    if (!SUPPORTED_TYPES.includes(file.type)) {
      setError(`Unsupported file type. Accepted: ${Object.values(LABELS).join(', ')}`)
      return false
    }
    if (file.size > 50 * 1024 * 1024) { setError('File too large (max 50MB)'); return false }
    setError('')
    return true
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file && validate(file)) onFile(file)
  }

  return (
    <div>
      <div onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)} onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className="border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-colors"
        style={{ borderColor: dragging ? 'var(--accent-cyan)' : 'var(--bg-border)',
                 background: dragging ? 'var(--accent-cyan)11' : 'transparent' }}>
        <p className="font-display text-lg font-semibold mb-2">Drop your file here</p>
        <p className="text-sm mb-1" style={{ color: 'var(--text-muted)' }}>or click to browse</p>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {Object.values(LABELS).join(' · ')} · Max 50MB
        </p>
        <input ref={inputRef} type="file" className="hidden" disabled={disabled}
          accept={SUPPORTED_TYPES.join(',')}
          onChange={e => { const f = e.target.files?.[0]; if (f && validate(f)) onFile(f) }} />
      </div>
      {error && <p className="mt-2 text-sm" style={{ color: 'var(--error)' }}>{error}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Create `components/upload/SubjectSelector.tsx`**

```typescript
'use client'
import type { Subject } from '@/types'

interface Props {
  subjects: Subject[]
  value: string
  onChange: (id: string) => void
}

export function SubjectSelector({ subjects, value, onChange }: Props) {
  return (
    <div>
      <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>
        Subject / Module
      </label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full px-4 py-3 rounded-lg text-sm outline-none"
        style={{ background: 'var(--bg-base)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)' }}>
        <option value="">Uncategorised</option>
        {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
    </div>
  )
}
```

- [ ] **Step 3: Create `app/upload/page.tsx`**

```typescript
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { DropZone } from '@/components/upload/DropZone'
import { SubjectSelector } from '@/components/upload/SubjectSelector'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { Input } from '@/components/ui/Input'
import { createClient } from '@/lib/supabase/client'
import type { Subject } from '@/types'

type Stage = 'idle' | 'uploading' | 'generating' | 'done' | 'error'

export default function UploadPage() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [stage, setStage] = useState<Stage>('idle')
  const [error, setError] = useState('')
  const [questionCount, setQuestionCount] = useState(0)

  useEffect(() => {
    createClient().from('subjects').select('*').order('name')
      .then(({ data }) => { if (data) setSubjects(data) })
  }, [])

  function handleFile(f: File) {
    setFile(f)
    if (!name) setName(f.name.replace(/\.[^/.]+$/, ''))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) return
    setError(''); setStage('uploading')

    const fd = new FormData()
    fd.append('file', file)
    fd.append('name', name)
    if (subjectId) fd.append('subjectId', subjectId)

    const uploadRes = await fetch('/api/upload', { method: 'POST', body: fd })
    if (!uploadRes.ok) {
      const { error: msg } = await uploadRes.json()
      setError(msg); setStage('error'); return
    }
    const { studySetId } = await uploadRes.json()

    setStage('generating')

    // Start polling for progress while generation runs
    const pollInterval = setInterval(async () => {
      const r = await fetch(`/api/generate/status/${studySetId}`)
      const { questionCount: qc } = await r.json()
      setQuestionCount(qc)
    }, 3000)

    const genRes = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studySetId }),
    })
    clearInterval(pollInterval)

    if (!genRes.ok) {
      const { error: msg } = await genRes.json()
      setError(msg || 'Generation failed'); setStage('error'); return
    }

    setStage('done')
    setTimeout(() => router.push('/dashboard'), 1500)
  }

  return (
    <main className="min-h-screen p-6 max-w-xl mx-auto">
      <h1 className="font-display text-3xl font-bold mb-8">New Study Set</h1>

      {stage === 'generating' && (
        <div className="text-center py-16">
          <Spinner size={40} />
          <p className="mt-4 font-display font-semibold text-lg">Generating your questions…</p>
          {questionCount > 0 && (
            <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>{questionCount} questions so far</p>
          )}
        </div>
      )}

      {stage === 'done' && (
        <div className="text-center py-16">
          <p className="font-display text-2xl font-bold" style={{ color: 'var(--success)' }}>Done!</p>
          <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>Redirecting to dashboard…</p>
        </div>
      )}

      {(stage === 'idle' || stage === 'uploading' || stage === 'error') && (
        <form onSubmit={handleSubmit} className="space-y-6">
          <DropZone onFile={handleFile} disabled={stage === 'uploading'} />
          {file && (
            <>
              <div>
                <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>
                  Study Set Name
                </label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Chapter 4 Notes" required />
              </div>
              <SubjectSelector subjects={subjects} value={subjectId} onChange={setSubjectId} />
              {error && <p className="text-sm" style={{ color: 'var(--error)' }}>{error}</p>}
              <Button type="submit" disabled={stage === 'uploading'} className="w-full">
                {stage === 'uploading' ? 'Uploading…' : 'Upload & Generate Questions'}
              </Button>
            </>
          )}
        </form>
      )}
    </main>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add components/upload/ app/upload/
git commit -m "feat: add upload page with drag-and-drop and generation progress"
```

---

## Task 15: Study Session

**Files:**
- Create: `components/study/AnswerButton.tsx`
- Create: `components/study/QuestionCard.tsx`
- Create: `components/study/FeedbackPanel.tsx`
- Create: `components/study/SessionProgress.tsx`
- Create: `hooks/useStudySession.ts`
- Create: `app/study/[id]/page.tsx`

- [ ] **Step 1: Create `components/study/AnswerButton.tsx`**

```typescript
'use client'
import { motion } from 'framer-motion'

const COLORS = ['var(--answer-a)', 'var(--answer-b)', 'var(--answer-c)', 'var(--answer-d)']
const LABELS = ['A', 'B', 'C', 'D']

interface Props {
  index: number
  text: string
  state: 'idle' | 'correct' | 'wrong' | 'reveal'
  onClick: () => void
  disabled: boolean
}

export function AnswerButton({ index, text, state, onClick, disabled }: Props) {
  const color = COLORS[index]
  const bg = state === 'correct' ? 'var(--success)'
           : state === 'wrong'   ? 'var(--error)'
           : state === 'reveal'  ? color + '40'
           : color + '22'
  const border = state === 'correct' ? 'var(--success)'
               : state === 'wrong'   ? 'var(--error)'
               : color

  return (
    <motion.button
      onClick={onClick} disabled={disabled}
      whileHover={!disabled ? { scale: 1.02 } : {}}
      whileTap={!disabled ? { scale: 0.98 } : {}}
      animate={state === 'wrong' ? { x: [0, -6, 6, -4, 4, 0] } : {}}
      className="w-full text-left px-5 py-4 rounded-xl border-2 font-body text-sm transition-colors disabled:cursor-not-allowed"
      style={{ background: bg, borderColor: border, color: 'var(--text-primary)' }}>
      <span className="font-display font-bold mr-3" style={{ color: border }}>{LABELS[index]}</span>
      {text}
    </motion.button>
  )
}
```

- [ ] **Step 2: Create `components/study/QuestionCard.tsx`**

```typescript
'use client'
import { motion } from 'framer-motion'
import { AnswerButton } from './AnswerButton'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useState } from 'react'
import { gradeShortAnswer } from '@/lib/ai/grade-short-answer'
import type { Question } from '@/types'

interface Props {
  question: Question
  onAnswer: (answer: string) => void
  answered: boolean
  correctAnswer: string
  givenAnswer: string
}

export function QuestionCard({ question, onAnswer, answered, correctAnswer, givenAnswer }: Props) {
  const [shortInput, setShortInput] = useState('')

  const getButtonState = (label: string) => {
    if (!answered) return 'idle'
    if (label === correctAnswer) return 'correct'
    if (label === givenAnswer) return 'wrong'
    return 'reveal'
  }

  return (
    <motion.div key={question.id}
      initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="w-full">
      <div className="mb-8 px-2">
        <p className="text-xs font-semibold uppercase tracking-widest mb-3"
          style={{ color: 'var(--accent-cyan)' }}>
          {question.type === 'mcq' ? 'Multiple Choice' : 'Short Answer'}
        </p>
        <p className="font-display text-2xl font-bold leading-tight">{question.question_text}</p>
      </div>

      {question.type === 'mcq' && question.options && (
        <div className="space-y-3">
          {question.options.map((opt, i) => (
            <AnswerButton key={opt.label} index={i} text={opt.text}
              state={getButtonState(opt.label)}
              onClick={() => onAnswer(opt.label)} disabled={answered} />
          ))}
        </div>
      )}

      {question.type === 'short_answer' && (
        <div className="space-y-4">
          <Input value={shortInput} onChange={e => setShortInput(e.target.value)}
            placeholder="Type your answer…" disabled={answered}
            onKeyDown={e => { if (e.key === 'Enter' && !answered) onAnswer(shortInput) }} />
          {!answered && (
            <Button onClick={() => onAnswer(shortInput)} disabled={!shortInput.trim()}>
              Submit Answer
            </Button>
          )}
          {answered && (
            <div className="p-4 rounded-xl border"
              style={{ borderColor: gradeShortAnswer(givenAnswer, correctAnswer) ? 'var(--success)' : 'var(--error)',
                background: 'var(--bg-surface)' }}>
              <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Correct answer:</p>
              <p className="font-display font-bold" style={{ color: 'var(--success)' }}>{correctAnswer}</p>
            </div>
          )}
        </div>
      )}
    </motion.div>
  )
}
```

- [ ] **Step 3: Create `components/study/FeedbackPanel.tsx`**

```typescript
'use client'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'

interface Props {
  visible: boolean
  feedback: string
  loading: boolean
  isCorrect: boolean
  onNext: () => void
}

export function FeedbackPanel({ visible, feedback, loading, isCorrect, onNext }: Props) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
          exit={{ y: 60, opacity: 0 }} transition={{ duration: 0.35, ease: 'easeOut' }}
          className="mt-6 p-6 rounded-2xl border"
          style={{ background: 'var(--bg-surface)', borderColor: isCorrect ? 'var(--success)' : 'var(--error)' }}>
          <p className="font-display font-bold mb-3" style={{ color: isCorrect ? 'var(--success)' : 'var(--error)' }}>
            {isCorrect ? '✓ Correct' : '✗ Incorrect'}
          </p>
          {loading ? <Spinner /> : (
            <>
              <p className="text-sm leading-relaxed mb-5" style={{ color: 'var(--text-muted)' }}>{feedback}</p>
              <Button onClick={onNext}>Next Question →</Button>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
```

- [ ] **Step 4: Create `components/study/SessionProgress.tsx`**

```typescript
import { ProgressBar } from '@/components/ui/ProgressBar'

interface Props { current: number; total: number; correct: number; studySetName: string }

export function SessionProgress({ current, total, correct, studySetName }: Props) {
  return (
    <div className="mb-8">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>{studySetName}</span>
        <span className="font-display font-bold text-sm">
          <span style={{ color: 'var(--accent-cyan)' }}>{current}</span>
          <span style={{ color: 'var(--text-muted)' }}>/{total}</span>
        </span>
      </div>
      <ProgressBar value={current} max={total} />
      <p className="text-xs mt-2 text-right" style={{ color: 'var(--success)' }}>
        {correct} correct
      </p>
    </div>
  )
}
```

- [ ] **Step 5: Create `hooks/useStudySession.ts`**

```typescript
'use client'
import { useState, useCallback, useRef } from 'react'
import { gradeShortAnswer } from '@/lib/ai/grade-short-answer'
import type { Question } from '@/types'

interface SessionState {
  question: Question | null
  answered: boolean
  givenAnswer: string
  isCorrect: boolean
  feedback: string
  feedbackLoading: boolean
  score: number
  total: number
  done: boolean
}

export function useStudySession(studySetId: string) {
  const [state, setState] = useState<SessionState>({
    question: null, answered: false, givenAnswer: '', isCorrect: false,
    feedback: '', feedbackLoading: false, score: 0, total: 0, done: false,
  })
  const questionRef = useRef<Question | null>(null)

  const fetchNext = useCallback(async () => {
    const res = await fetch(`/api/session/next?studySetId=${studySetId}`)
    const data = await res.json()
    if (data.done) {
      setState(s => ({ ...s, done: true }))
    } else {
      questionRef.current = data.question
      setState(s => ({ ...s, question: data.question, answered: false, givenAnswer: '', feedback: '', isCorrect: false }))
    }
  }, [studySetId])

  const submitAnswer = useCallback(async (answer: string) => {
    const question = questionRef.current
    if (!question) return

    const isCorrect = question.type === 'mcq'
      ? answer === question.correct_answer
      : gradeShortAnswer(answer, question.correct_answer)

    const smQuality = question.type === 'mcq' && isCorrect ? 5 : isCorrect ? 4 : 1

    setState(s => ({
      ...s, answered: true, givenAnswer: answer, isCorrect,
      feedbackLoading: true, total: s.total + 1,
      score: isCorrect ? s.score + 1 : s.score,
    }))

    const [, feedbackRes] = await Promise.all([
      fetch('/api/session/answer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId: question.id, answerGiven: answer, isCorrect, smQuality }),
      }),
      fetch('/api/feedback', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionText: question.question_text, correctAnswer: question.correct_answer,
                               answerGiven: answer, isCorrect }),
      }),
    ])

    const { feedback } = await feedbackRes.json()
    setState(s => ({ ...s, feedback, feedbackLoading: false }))
  }, [studySetId])

  return { ...state, fetchNext, submitAnswer }
}
```

- [ ] **Step 6: Create `app/study/[id]/page.tsx`**

```typescript
'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useStudySession } from '@/hooks/useStudySession'
import { QuestionCard } from '@/components/study/QuestionCard'
import { FeedbackPanel } from '@/components/study/FeedbackPanel'
import { SessionProgress } from '@/components/study/SessionProgress'
import { Spinner } from '@/components/ui/Spinner'
import { createClient } from '@/lib/supabase/client'

export default function StudyPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const session = useStudySession(id)
  const [totalQuestions, setTotalQuestions] = useState(0)
  const [studySetName, setStudySetName] = useState('Study Session')

  useEffect(() => {
    session.fetchNext()
    // Fetch study set metadata
    const supabase = createClient()
    Promise.all([
      supabase.from('study_sets').select('name').eq('id', id).single(),
      supabase.from('questions').select('*', { count: 'exact', head: true }).eq('study_set_id', id),
    ]).then(([{ data: set }, { count }]) => {
      if (set) setStudySetName(set.name)
      if (count) setTotalQuestions(count)
    })
  }, [])  // eslint-disable-line

  useEffect(() => {
    if (!session.done) return
    async function redirectWithWeakIds() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      const { data } = await supabase
        .from('question_state')
        .select('question_id, ease_factor, questions!inner(study_set_id)')
        .eq('user_id', user?.id ?? '')
        .eq('questions.study_set_id', id)
        .lt('ease_factor', 2.0)
        .order('ease_factor', { ascending: true })
        .limit(5)
      const weakIds = (data ?? []).map((r: any) => r.question_id).join(',')
      router.push(`/study/${id}/complete?score=${session.score}&total=${session.total}&weakIds=${weakIds}`)
    }
    redirectWithWeakIds()
  }, [session.done])  // eslint-disable-line

  if (!session.question && !session.done) return (
    <main className="min-h-screen flex items-center justify-center"><Spinner size={36} /></main>
  )

  return (
    <main className="min-h-screen p-6 max-w-2xl mx-auto">
      <SessionProgress current={session.total} total={totalQuestions}
        correct={session.score} studySetName={studySetName} />
      {session.question && (
        <QuestionCard question={session.question} onAnswer={session.submitAnswer}
          answered={session.answered} correctAnswer={session.question.correct_answer}
          givenAnswer={session.givenAnswer} />
      )}
      <FeedbackPanel visible={session.answered} feedback={session.feedback}
        loading={session.feedbackLoading} isCorrect={session.isCorrect}
        onNext={session.fetchNext} />
    </main>
  )
}
```

- [ ] **Step 7: Commit**

```bash
git add components/study/ hooks/useStudySession.ts app/study/
git commit -m "feat: add study session with adaptive questioning and Socratic feedback"
```

---

## Task 16: Session Complete + Settings

**Files:**
- Create: `components/study/SessionComplete.tsx`
- Create: `app/study/[id]/complete/page.tsx`
- Create: `app/settings/page.tsx`

- [ ] **Step 1: Create `components/study/SessionComplete.tsx`**

```typescript
import { Button } from '@/components/ui/Button'
import Link from 'next/link'
import type { Question } from '@/types'

interface Props {
  studySetId: string
  score: number
  total: number
  weakQuestions: Pick<Question, 'id' | 'question_text'>[]
}

export function SessionComplete({ studySetId, score, total, weakQuestions }: Props) {
  const pct = Math.round((score / total) * 100)
  return (
    <div className="w-full max-w-md text-center mx-auto">
      <h1 className="font-display text-5xl font-extrabold mb-2"
        style={{ color: pct >= 70 ? 'var(--success)' : 'var(--accent-amber)' }}>
        {pct}%
      </h1>
      <p className="text-lg mb-1 font-display font-semibold">{score}/{total} correct</p>
      <p className="text-sm mb-8" style={{ color: 'var(--text-muted)' }}>
        {pct >= 80 ? 'Excellent work!' : pct >= 60 ? 'Good progress!' : 'Keep practising!'}
      </p>
      {weakQuestions.length > 0 && (
        <div className="text-left mb-8 p-4 rounded-xl border"
          style={{ borderColor: 'var(--bg-border)', background: 'var(--bg-surface)' }}>
          <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text-muted)' }}>Topics to review:</p>
          <ul className="space-y-2">
            {weakQuestions.map(q => (
              <li key={q.id} className="text-sm">• {q.question_text}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-col gap-3">
        <Link href={`/study/${studySetId}`}><Button className="w-full">Study Again</Button></Link>
        <Link href="/dashboard"><Button variant="ghost" className="w-full">Back to Dashboard</Button></Link>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `app/study/[id]/complete/page.tsx`**

```typescript
'use client'
import { useEffect, useState } from 'react'
import { useSearchParams, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { SessionComplete } from '@/components/study/SessionComplete'
import type { Question } from '@/types'

export default function SessionCompletePage() {
  const { id } = useParams<{ id: string }>()
  const params = useSearchParams()
  const score = Number(params.get('score') ?? 0)
  const total = Number(params.get('total') ?? 1)
  const weakIdStr = params.get('weakIds') ?? ''
  const weakIds = weakIdStr ? weakIdStr.split(',').filter(Boolean) : []

  const [weakQuestions, setWeakQuestions] = useState<Pick<Question, 'id' | 'question_text'>[]>([])

  useEffect(() => {
    if (!weakIds.length) return
    createClient().from('questions').select('id, question_text').in('id', weakIds)
      .then(({ data }) => { if (data) setWeakQuestions(data as Pick<Question, 'id' | 'question_text'>[]) })
  }, [weakIdStr])  // eslint-disable-line

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <SessionComplete studySetId={id} score={score} total={total} weakQuestions={weakQuestions} />
    </main>
  )
}
```

- [ ] **Step 3: Create `app/settings/page.tsx`**

```typescript
'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import type { Subject } from '@/types'

export default function SettingsPage() {
  const router = useRouter()
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#00c9ff')
  const [deleteTarget, setDeleteTarget] = useState<Subject | null>(null)

  async function load() {
    const { data } = await createClient().from('subjects').select('*').order('name')
    if (data) setSubjects(data)
  }

  useEffect(() => { load() }, [])

  async function createSubject(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    await createClient().from('subjects').insert({ name: newName.trim(), color: newColor })
    setNewName(''); setNewColor('#00c9ff'); load()
  }

  async function deleteSubject(id: string) {
    await createClient().from('subjects').delete().eq('id', id)
    setDeleteTarget(null); load()
  }

  async function signOut() {
    await createClient().auth.signOut()
    router.push('/login')
  }

  return (
    <main className="min-h-screen p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <h1 className="font-display text-3xl font-bold">Settings</h1>
        <Button variant="ghost" onClick={() => router.back()}>← Back</Button>
      </div>

      <section className="mb-10">
        <h2 className="font-display font-bold text-xl mb-4">Subjects</h2>
        <form onSubmit={createSubject} className="flex gap-3 mb-6">
          <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="New subject name" />
          <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)}
            className="w-12 h-12 rounded-lg cursor-pointer border-0 p-1"
            style={{ background: 'var(--bg-surface)' }} />
          <Button type="submit">Add</Button>
        </form>
        <div className="space-y-3">
          {subjects.map(s => (
            <div key={s.id} className="flex items-center gap-3 p-4 rounded-xl border"
              style={{ background: 'var(--bg-surface)', borderColor: 'var(--bg-border)' }}>
              <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ background: s.color }} />
              <input defaultValue={s.name}
                className="flex-1 font-semibold bg-transparent outline-none border-b border-transparent focus:border-current"
                style={{ color: 'var(--text-primary)' }}
                onBlur={async (e) => {
                  const newName = e.target.value.trim()
                  if (newName && newName !== s.name) {
                    await createClient().from('subjects').update({ name: newName }).eq('id', s.id)
                    load()
                  }
                }}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
              />
              <button onClick={() => setDeleteTarget(s)} className="text-sm"
                style={{ color: 'var(--error)' }}>Delete</button>
            </div>
          ))}
          {subjects.length === 0 && (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No subjects yet.</p>
          )}
        </div>
      </section>

      <section>
        <h2 className="font-display font-bold text-xl mb-4">Account</h2>
        <Button variant="danger" onClick={signOut}>Sign Out</Button>
      </section>

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Subject">
        <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
          Delete <strong>{deleteTarget?.name}</strong>? Study sets will be moved to Uncategorised.
        </p>
        <div className="flex gap-3">
          <Button variant="danger" onClick={() => deleteTarget && deleteSubject(deleteTarget.id)}>Delete</Button>
          <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
        </div>
      </Modal>
    </main>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add components/study/SessionComplete.tsx app/study/ app/settings/
git commit -m "feat: add session complete screen and settings page"
```

---

## Task 17: Fix weakIds Tracking in useStudySession

The `weakIds` in `useStudySession` needs to be populated from the `question_state` table after answers are recorded. Update the hook:

- [ ] **Step 1: Update `hooks/useStudySession.ts` — add weakIds population**

After the `session.done` check in `submitAnswer`, fetch the 5 weakest question IDs:

```typescript
// Inside submitAnswer, after recording the answer, if we're nearing done:
// Actually, weakIds are computed at redirect time from question_state.
// In the done useEffect in the page, replace with a fetch:
```

Update `app/study/[id]/page.tsx` done effect:

```typescript
useEffect(() => {
  if (!session.done) return
  async function redirectWithWeakIds() {
    const supabase = (await import('@/lib/supabase/client')).createClient()
    const { data } = await supabase
      .from('question_state')
      .select('question_id, ease_factor, questions!inner(study_set_id)')
      .eq('user_id', (await supabase.auth.getUser()).data.user?.id ?? '')
      .eq('questions.study_set_id', id)
      .lt('ease_factor', 2.0)
      .order('ease_factor', { ascending: true })
      .limit(5)
    const weakIds = (data ?? []).map((r: any) => r.question_id).join(',')
    router.push(`/study/${id}/complete?score=${session.score}&total=${session.total}&weakIds=${weakIds}`)
  }
  redirectWithWeakIds()
}, [session.done])  // eslint-disable-line
```

- [ ] **Step 2: Commit**

```bash
git add app/study/ hooks/
git commit -m "feat: compute weak question IDs from question_state on session complete"
```

---

## Task 18: Deploy to Vercel

- [ ] **Step 1: Push to GitHub**

```bash
git remote add origin https://github.com/<your-username>/smart-study.git
git push -u origin main
```

- [ ] **Step 2: Connect to Vercel**

1. Go to vercel.com → New Project → Import the GitHub repo
2. Framework: Next.js (auto-detected)
3. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `DEEPSEEK_API_KEY`
4. Deploy

- [ ] **Step 3: Run Supabase migrations against production**

```bash
npx supabase db push
```

- [ ] **Step 4: Verify**

- Visit the deployed URL
- Register an account, confirm email, log in
- Upload a small PDF (< 5 pages) and verify question generation completes
- Run a study session end-to-end

- [ ] **Step 5: Final commit**

```bash
git add .
git commit -m "chore: final cleanup and deploy"
git push
```

---

## Quick Reference — Running Tests

```bash
npm test                          # run all tests once
npm run test:watch               # watch mode
npm test -- __tests__/lib/sm2    # run specific test file
npm run dev                       # local dev server (localhost:3000)
```
