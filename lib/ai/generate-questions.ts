import { chunkText } from './chunk-text'
import { createAIClient } from './create-ai-client'
import { DEFAULT_BASE_PROMPT } from './constants'
import type { Question, AIConfig } from '@/types'

const SYSTEM_PROMPT = `You are a study assistant that generates quiz questions from educational text.
Always respond with valid JSON only — no explanation, no markdown, no code fences.

Return a JSON array where each object has:
  - "type": "mcq" or "short_answer"
  - "question_text": string
  - "options": array of {label, text} for MCQ (labels "A","B","C","D"), null for short_answer
  - "correct_answer": for MCQ, the label ("A","B","C","D"); for short_answer, a single word or short phrase (max 5 words) for exact matching

For short_answer, correct_answer MUST be terse (1–5 words) to enable exact string matching.`

async function generateFromChunk(
  chunk: string,
  studySetId: string,
  n: number,
  aiConfig: AIConfig,
  customPrompt?: string,
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
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.7,
    })
    const raw = res.choices[0].message.content ?? '[]'
    const parsed = JSON.parse(raw) as Record<string, unknown>[]
    return parsed.map(q => ({
      study_set_id: studySetId,
      type: q.type as 'mcq' | 'short_answer',
      question_text: q.question_text as string,
      options: (q.options ?? null) as Question['options'],
      correct_answer: q.correct_answer as string,
    }))
  } catch {
    if (retries > 0) return generateFromChunk(chunk, studySetId, n, aiConfig, customPrompt, retries - 1)
    throw new Error('Failed to generate questions after retry')
  }
}

export async function generateQuestions(
  text: string,
  studySetId: string,
  aiConfig: AIConfig,
  customPrompt?: string
): Promise<Omit<Question, 'id' | 'created_at'>[]> {
  const chunks = chunkText(text)
  const all: Omit<Question, 'id' | 'created_at'>[] = []
  for (const chunk of chunks) {
    const n = Math.max(5, Math.round(10 * (chunk.length / 3000)))
    const questions = await generateFromChunk(chunk, studySetId, n, aiConfig, customPrompt)
    all.push(...questions)
  }
  return all
}
