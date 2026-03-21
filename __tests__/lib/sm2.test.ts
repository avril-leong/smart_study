import { describe, it, expect } from 'vitest'
import { updateSM2 } from '@/lib/spaced-repetition/sm2'

describe('updateSM2', () => {
  const defaults = { easeFactor: 2.5, interval: 1, repetitions: 0 }

  it('first correct answer sets interval to 1 day', () => {
    const result = updateSM2({ quality: 5, ...defaults })
    expect(result.interval).toBe(1)
    expect(result.repetitions).toBe(1)
  })

  it('second correct answer sets interval to 6 days', () => {
    const result = updateSM2({ quality: 5, easeFactor: 2.5, interval: 1, repetitions: 1 })
    expect(result.interval).toBe(6)
    expect(result.repetitions).toBe(2)
  })

  it('third correct answer multiplies interval by ease factor', () => {
    const result = updateSM2({ quality: 5, easeFactor: 2.5, interval: 6, repetitions: 2 })
    expect(result.interval).toBe(16) // newEF = 2.6, round(6 * 2.6) = 16
  })

  it('failing answer resets interval to 1 and repetitions to 0', () => {
    const result = updateSM2({ quality: 1, easeFactor: 2.5, interval: 6, repetitions: 2 })
    expect(result.interval).toBe(1)
    expect(result.repetitions).toBe(0)
  })

  it('ease factor never drops below 1.3', () => {
    const result = updateSM2({ quality: 0, easeFactor: 1.3, interval: 1, repetitions: 0 })
    expect(result.easeFactor).toBeGreaterThanOrEqual(1.3)
  })

  it('nextReview is in the future', () => {
    const result = updateSM2({ quality: 4, ...defaults })
    expect(result.nextReview.getTime()).toBeGreaterThan(Date.now())
  })

  it('nextReview is approximately interval days in the future', () => {
    const result = updateSM2({ quality: 5, easeFactor: 2.5, interval: 1, repetitions: 1 })
    // interval should be 6 days
    const expectedMs = Date.now() + 6 * 24 * 60 * 60 * 1000
    expect(Math.abs(result.nextReview.getTime() - expectedMs)).toBeLessThan(1000)
  })

  it('quality 3 is treated as passing (not reset)', () => {
    const result = updateSM2({ quality: 3, easeFactor: 2.5, interval: 6, repetitions: 2 })
    expect(result.repetitions).toBe(3)
    expect(result.interval).not.toBe(1)
  })
})
