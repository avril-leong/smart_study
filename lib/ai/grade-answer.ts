import { gradeShortAnswer } from './grade-short-answer'
import type { Question } from '@/types'

export function gradeAnswer(
  question: Pick<Question, 'type' | 'correct_answer'>,
  answerGiven: string
): boolean {
  if (question.type === 'mcq') {
    return answerGiven === question.correct_answer
  }
  if (question.type === 'multi_select') {
    const correctSet = new Set(question.correct_answer.split(',').map(s => s.trim()))
    const givenSet = new Set(answerGiven.split(',').map(s => s.trim()))
    return correctSet.size === givenSet.size && Array.from(correctSet).every(l => givenSet.has(l))
  }
  return gradeShortAnswer(answerGiven, question.correct_answer)
}
