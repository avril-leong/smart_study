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
