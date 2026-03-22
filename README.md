# SmartStudy

An AI-powered study app that turns your lecture notes and PDFs into personalised quiz sessions. Upload your documents, let AI generate questions, then study with spaced repetition — so you focus on what you haven't mastered yet.

> **Note:** This project was built to test the [Claude Code Superpowers](https://github.com/anthropics/claude-code) skill — an agentic workflow plugin for Claude Code that enables brainstorming, spec writing, plan writing, and subagent-driven development. The entire codebase was designed and implemented through that workflow.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Environment Variables](#environment-variables)
  - [Database Setup](#database-setup)
- [Usage](#usage)
- [Project Structure](#project-structure)
- [Running Tests](#running-tests)
- [License](#license)

---

## Features

- **PDF & document upload** — Upload lecture slides, notes, or any PDF/DOCX. Text is extracted and stored for generation.
- **AI question generation** — Generates multiple-choice and short-answer questions using any OpenAI-compatible model (DeepSeek, OpenAI, OpenRouter).
- **Spaced repetition (SM-2)** — Questions are scheduled using the SM-2 algorithm so you review harder material more often.
- **Mastery tracking** — Dashboard cards show your % mastery per study set based on questions answered correctly.
- **Focus mode** — Optional toggle to instruct the AI to skip administrative content (deadlines, course schedules) and only generate questions from lesson material.
- **Per-set customisation** — Set a custom prompt, target question count (10/25/50), and subject per study set.
- **Bring Your Own Key (BYOK)** — Your AI API key is stored encrypted. No shared API usage.
- **Subject grouping** — Organise study sets by subject with colour-coded groups on the dashboard.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | [Next.js 14](https://nextjs.org/) (App Router) |
| Language | TypeScript |
| Database & Auth | [Supabase](https://supabase.com/) (Postgres + RLS + Storage) |
| AI | OpenAI-compatible SDK — DeepSeek / OpenAI / OpenRouter |
| Styling | Tailwind CSS |
| Animations | Framer Motion |
| Testing | Vitest |
| Deployment | Vercel |

---

## Getting Started

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com/) project
- An API key for an OpenAI-compatible provider (e.g. [DeepSeek](https://platform.deepseek.com/), [OpenAI](https://platform.openai.com/), or [OpenRouter](https://openrouter.ai/))

### Installation

```bash
# Clone the repo
git clone https://github.com/avril-leong/smart_study.git
cd smart_study

# Install dependencies
npm install

# Copy the example env file and fill in your values
cp .env.example .env.local
```

### Environment Variables

Create a `.env.local` file at the root with the following:

```env
# Supabase — found in: Supabase Dashboard → Project Settings → API
NEXT_PUBLIC_SUPABASE_URL=your-supabase-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key

# Supabase service role key — server only, never expose to client
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
```

> Your AI provider API key is stored in the app itself (encrypted in the database) — you add it via **Settings → AI Settings** after signing in. It is never stored in environment variables.

### Database Setup

Run the following migrations in your Supabase SQL Editor (**Dashboard → SQL Editor**) in order:

1. Initial schema (users, study sets, questions, subjects)
2. BYOK AI settings
3. Focus lesson content column:

```sql
ALTER TABLE study_sets ADD COLUMN IF NOT EXISTS focus_lesson_content boolean DEFAULT true;
```

> Full migration files are in `supabase/migrations/` if you have the Supabase CLI set up.

Then start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Usage

1. **Sign up / Log in** at `/auth`
2. **Add your AI API key** at Settings → AI Settings (DeepSeek is recommended — low cost, high quality)
3. **Create a study set** — click **+ New Study Set**, upload a PDF or document
4. **Wait for generation** — the dashboard card shows live progress while questions are being generated
5. **Study** — click the Study button on any ready study set
6. **Track mastery** — the progress ring on each card fills as you correctly answer questions

### Tips

- Enable **Focus on lesson content only** (on by default) in study set settings to skip administrative content in your PDFs
- Use **Custom Instructions** to steer question style, e.g. *"Focus on definitions and key terms only"*
- After completing a session, click **Keep Practising** to drill your weakest questions

---

## Project Structure

```
smart_study/
├── app/                    # Next.js App Router pages and API routes
│   ├── api/                # Backend API routes (generate, session, settings, auth)
│   ├── dashboard/          # Main dashboard page
│   ├── study/[id]/         # Study session and completion pages
│   └── upload/             # Document upload flow
├── components/             # React components
│   ├── dashboard/          # Dashboard-specific components (cards, modals, subject groups)
│   ├── study/              # Study session components (question card, feedback, progress)
│   └── ui/                 # Shared UI primitives (Button, Badge, Spinner, ProgressRing)
├── hooks/                  # Custom React hooks (useStudySets, useStudySession)
├── lib/                    # Core business logic
│   ├── ai/                 # Question generation, AI client, prompt engineering
│   ├── spaced-repetition/  # SM-2 algorithm
│   └── supabase/           # Supabase client helpers
├── types/                  # Shared TypeScript interfaces
├── __tests__/              # Vitest unit tests
└── docs/superpowers/       # Design specs and implementation plans (Superpowers workflow)
```

---

## Running Tests

```bash
# Run all tests once
npm test

# Run in watch mode
npm run test:watch
```

---

## License

MIT
