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
