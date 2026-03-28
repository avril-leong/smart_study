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

export function useStudySession(studySetId: string, practice = false) {
  const [state, setState] = useState<SessionState>({
    question: null, answered: false, givenAnswer: '', isCorrect: false,
    feedback: '', feedbackLoading: false, score: 0, total: 0, done: false,
  })
  const questionRef = useRef<Question | null>(null)

  const fetchNext = useCallback(async () => {
    const res = await fetch(`/api/session/next?studySetId=${studySetId}${practice ? '&practice=true' : ''}`)
    const data = await res.json()
    if (data.done) {
      setState(s => ({ ...s, done: true }))
    } else {
      questionRef.current = data.question
      setState(s => ({ ...s, question: data.question, answered: false, givenAnswer: '', feedback: '', isCorrect: false }))
    }
  }, [studySetId, practice])  // eslint-disable-line

  const submitAnswer = useCallback(async (answer: string) => {
    const question = questionRef.current
    if (!question) return

    let isCorrect: boolean
    if (question.type === 'mcq') {
      isCorrect = answer === question.correct_answer
    } else if (question.type === 'multi_select') {
      const correctSet = new Set(question.correct_answer.split(',').map(s => s.trim()))
      const givenSet = new Set(answer.split(',').map(s => s.trim()))
      isCorrect = correctSet.size === givenSet.size && Array.from(correctSet).every(l => givenSet.has(l))
    } else {
      isCorrect = gradeShortAnswer(answer, question.correct_answer)
    }

    const smQuality = question.type !== 'short_answer' && isCorrect ? 5 : isCorrect ? 4 : 1

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
