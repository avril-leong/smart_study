import { describe, it, expect } from 'vitest'
import { gradeAnswer } from '@/lib/ai/grade-answer'

describe('gradeAnswer', () => {
  describe('mcq', () => {
    const question = { type: 'mcq' as const, correct_answer: 'B' }

    it('matches the correct label', () => {
      expect(gradeAnswer(question, 'B')).toBe(true)
    })

    it('rejects a wrong label', () => {
      expect(gradeAnswer(question, 'A')).toBe(false)
    })
  })

  describe('multi_select', () => {
    const question = { type: 'multi_select' as const, correct_answer: 'A,C' }

    it('matches when all correct labels are given in any order', () => {
      expect(gradeAnswer(question, 'C,A')).toBe(true)
    })

    it('rejects a partial selection', () => {
      expect(gradeAnswer(question, 'A')).toBe(false)
    })

    it('rejects an extra incorrect label', () => {
      expect(gradeAnswer(question, 'A,C,B')).toBe(false)
    })

    it('tolerates whitespace around labels', () => {
      expect(gradeAnswer(question, ' A , C ')).toBe(true)
    })
  })

  describe('short_answer', () => {
    const question = { type: 'short_answer' as const, correct_answer: 'mitochondria' }

    it('matches case-insensitively, ignoring punctuation/whitespace', () => {
      expect(gradeAnswer(question, ' Mitochondria. ')).toBe(true)
    })

    it('rejects a wrong answer', () => {
      expect(gradeAnswer(question, 'nucleus')).toBe(false)
    })
  })
})
