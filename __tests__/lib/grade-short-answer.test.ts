import { describe, it, expect } from 'vitest'
import { gradeShortAnswer } from '@/lib/ai/grade-short-answer'

describe('gradeShortAnswer', () => {
  it('exact match returns true', () => {
    expect(gradeShortAnswer('mitochondria', 'mitochondria')).toBe(true)
  })

  it('case insensitive', () => {
    expect(gradeShortAnswer('Mitochondria', 'mitochondria')).toBe(true)
  })

  it('ignores leading/trailing whitespace', () => {
    expect(gradeShortAnswer('  mitochondria  ', 'mitochondria')).toBe(true)
  })

  it('ignores punctuation', () => {
    expect(gradeShortAnswer('mitochondria.', 'mitochondria')).toBe(true)
  })

  it('wrong answer returns false', () => {
    expect(gradeShortAnswer('nucleus', 'mitochondria')).toBe(false)
  })

  it('synonym/different phrasing returns false (known limitation)', () => {
    expect(gradeShortAnswer('the mitochondria', 'mitochondria')).toBe(false)
  })
})
