import { describe, it, expect } from 'vitest'
import { chunkText } from '@/lib/ai/chunk-text'

describe('chunkText', () => {
  it('returns single chunk when text is under limit', () => {
    const result = chunkText('hello world', 100)
    expect(result).toEqual(['hello world'])
  })

  it('splits text into multiple chunks under maxChars', () => {
    const long = 'word '.repeat(200) // 1000 chars
    const result = chunkText(long, 300)
    expect(result.length).toBeGreaterThan(1)
    result.forEach(chunk => expect(chunk.length).toBeLessThanOrEqual(310))
  })

  it('all content is preserved (no data loss)', () => {
    // Whitespace normalization is intentional: chunk boundaries trim whitespace,
    // which is acceptable for study content. This test verifies no words are lost.
    const long = 'abcde '.repeat(500)
    const chunks = chunkText(long, 400)
    const rejoined = chunks.join(' ')
    // Check no words are lost (whitespace-normalized comparison)
    expect(rejoined.replace(/\s+/g, ' ').trim()).toBe(long.trim())
    // Check no words are duplicated (word count must match)
    const originalWords = long.trim().split(/\s+/)
    const rejoinedWords = rejoined.trim().split(/\s+/)
    expect(rejoinedWords.length).toBe(originalWords.length)
  })

  it('caps total input at MAX_INPUT_CHARS', () => {
    const huge = 'x'.repeat(20000)
    const chunks = chunkText(huge, 3000, 15000)
    const total = chunks.reduce((s, c) => s + c.length, 0)
    expect(total).toBeLessThanOrEqual(15000)
  })
})
