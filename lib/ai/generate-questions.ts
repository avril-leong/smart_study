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
  focusLessonContent = true
): Promise<Omit<Question, 'id' | 'created_at'>[]> {
  const cappedText = text.slice(0, MAX_INPUT_CHARS)
  return generateFromChunk(cappedText, studySetId, questionCount, aiConfig, customPrompt, focusLessonContent)
}
