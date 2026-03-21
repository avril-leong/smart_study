import type { SM2Input, SM2Result } from '@/types'

export function updateSM2({ quality, easeFactor, interval, repetitions }: SM2Input): SM2Result {
  let newEF = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
  if (newEF < 1.3) newEF = 1.3

  let newInterval: number
  let newRepetitions: number

  if (quality < 3) {
    newInterval = 1
    newRepetitions = 0
  } else {
    newRepetitions = repetitions + 1
    if (repetitions === 0)      newInterval = 1
    else if (repetitions === 1) newInterval = 6
    else                        newInterval = Math.round(interval * newEF)
  }

  const nextReview = new Date()
  nextReview.setDate(nextReview.getDate() + newInterval)

  return { easeFactor: newEF, interval: newInterval, repetitions: newRepetitions, nextReview }
}
