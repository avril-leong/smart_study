export type GenerationStatus = 'pending' | 'processing' | 'done' | 'error'
export type QuestionType = 'mcq' | 'short_answer'

export type AIProvider = 'openai' | 'deepseek' | 'openrouter'

export interface AIConfig {
  provider: AIProvider
  apiKey: string        // decrypted, server-side only — never returned to client
  model: string         // resolved: user value or provider default if empty
  basePrompt: string    // resolved: user value or DEFAULT_BASE_PROMPT if null
  globalCustomPrompt: string | null
}

export interface Subject {
  id: string
  user_id: string
  name: string
  color: string
  created_at: string
}

export interface StudySetDocument {
  id: string
  study_set_id: string
  file_name: string
  file_type: string
  extracted_text_path: string
  uploaded_at: string
}

export interface StudySet {
  id: string
  user_id: string
  subject_id: string | null
  name: string
  file_name: string | null            // nullable after migration
  file_type: string | null            // nullable after migration
  extracted_text_path: string | null  // nullable after migration
  generation_status: GenerationStatus
  last_studied_at: string | null
  created_at: string
  updated_at: string
  // joined / computed fields (not in DB columns)
  question_count?: number
  subject?: Subject | null
  documents: StudySetDocument[]       // always populated by useStudySets
  custom_prompt?: string | null       // per-set instruction; NULL = use global default
  question_count_pref?: number | null // 10 | 25 | 50; NULL = use default (25)
  focus_lesson_content?: boolean      // filter out administrative/non-lesson content during generation
  mastery?: number                    // 0–100, computed: correctly-answered-once / total
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
