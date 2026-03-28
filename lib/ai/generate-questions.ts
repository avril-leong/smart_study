import { MAX_INPUT_CHARS } from './chunk-text'
import { DEFAULT_BASE_PROMPT } from './constants'
import { createAIClient } from './create-ai-client'
import type { Question, AIConfig, QuestionType } from '@/types'

// Unchanged: JSON format rules and per-type output spec
const BASE_FORMAT_RULES = `You are a study assistant that generates quiz questions from educational text.
Always respond with valid JSON only — no explanation, no markdown, no code fences.

Return a JSON array where each object has:
  - "type": "mcq", "short_answer", or "multi_select"
  - "question_text": string
  - "options": array of {label, text} with labels A–D for mcq/multi_select; null for short_answer
  - "correct_answer": per-type rules below

Per-type rules:
  - mcq: correct_answer is the single correct label ("A", "B", "C", or "D").
  - short_answer: options is null; correct_answer is a terse phrase (1–5 words) for exact string matching.
  - multi_select: question_text MUST be phrased as "Which of the following...? (Select all that apply)";
    correct_answer is comma-separated labels of ALL correct options with exactly 2–3 correct answers, e.g. "A,C" or "B,C,D".

For short_answer, correct_answer MUST be terse (1–5 words) to enable exact string matching.`

const GENERAL_INSTRUCTION = `

Generate questions that test genuine understanding, not surface recall.
- Cover the breadth of concepts in the text, not just definitions
- Vary difficulty: include foundational questions and ones requiring deeper reasoning
- Write distractors that reflect plausible misconceptions, not obviously wrong answers
- Prefer questions that ask why, how, or what would happen — not just what is`

const EXAM_PREP_INSTRUCTION = `

Generate exam-style questions that mirror the rigour of formal assessments.
- Distribute questions across cognitive levels: ~30% recall, ~40% comprehension, ~30% application
- Distractors must reflect genuine misconceptions students commonly make
- Questions must be precise and unambiguous — no two interpretations possible
- Prioritise the most important, frequently examined concepts in the text`

const FOCUS_INSTRUCTION = `

Focus exclusively on subject matter concepts, theories, definitions, and principles.
Skip any content about: deadlines, submission dates, assessment weightings, course schedules,
administrative procedures, contact details, or program structure.
If a passage contains only administrative content, do not generate questions for it — return
fewer questions rather than asking about irrelevant material.`

const TYPE_LABELS: Record<QuestionType, string> = {
  mcq: 'MCQ',
  short_answer: 'short answer',
  multi_select: 'multi-select (select all that apply)',
}

export function buildSystemPrompt(
  focusLessonContent: boolean,
  generationStyle: 'general' | 'exam_prep' = 'general'
): string {
  const styleInstruction = generationStyle === 'exam_prep' ? EXAM_PREP_INSTRUCTION : GENERAL_INSTRUCTION
  return BASE_FORMAT_RULES + styleInstruction + (focusLessonContent ? FOCUS_INSTRUCTION : '')
}

async function generateFromChunk(
  chunk: string,
  studySetId: string,
  n: number,
  aiConfig: AIConfig,
  customPrompt?: string,
  focusLessonContent?: boolean,
  generationStyle?: 'general' | 'exam_prep',
  questionTypes: QuestionType[] = ['mcq', 'short_answer'],
  retries = 1
): Promise<Omit<Question, 'id' | 'created_at'>[]> {
  const { client, model } = createAIClient(aiConfig)

  const typeList = questionTypes.map(t => TYPE_LABELS[t]).join(', ')
  const baseWithN = DEFAULT_BASE_PROMPT.replace('{n}', String(n))
  const userMessage = [
    baseWithN,
    `Use only these question types: ${typeList}.`,
    '',
    'Text:',
    chunk,
    customPrompt ? `\n\nAdditional focus: ${customPrompt}` : '',
  ].filter(Boolean).join('\n')

  try {
    const res = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: buildSystemPrompt(focusLessonContent ?? false, generationStyle ?? 'general') },
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
      type: q.type as QuestionType,
      question_text: q.question_text as string,
      options: (q.options ?? null) as Question['options'],
      correct_answer: q.correct_answer as string,
    }))
  } catch {
    if (retries > 0) return generateFromChunk(chunk, studySetId, n, aiConfig, customPrompt, focusLessonContent, generationStyle, questionTypes, retries - 1)
    throw new Error('Failed to generate questions after retry')
  }
}

export async function generateQuestions(
  text: string,
  studySetId: string,
  aiConfig: AIConfig,
  customPrompt?: string,
  questionCount = 25,
  focusLessonContent = true,
  generationStyle?: 'general' | 'exam_prep',
  questionTypes: QuestionType[] = ['mcq', 'short_answer']
): Promise<Omit<Question, 'id' | 'created_at'>[]> {
  const cappedText = text.slice(0, MAX_INPUT_CHARS)
  return generateFromChunk(cappedText, studySetId, questionCount, aiConfig, customPrompt, focusLessonContent, generationStyle ?? 'general', questionTypes)
}
