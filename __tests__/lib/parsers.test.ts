import { describe, it, expect } from 'vitest'
import { getParser } from '@/lib/parsers/index'

describe('getParser', () => {
  it('returns parser for pdf', () => expect(getParser('application/pdf')).toBeDefined())
  it('returns parser for txt', () => expect(getParser('text/plain')).toBeDefined())
  it('returns parser for docx', () => expect(getParser('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBeDefined())
  it('returns parser for pptx', () => expect(getParser('application/vnd.openxmlformats-officedocument.presentationml.presentation')).toBeDefined())
  it('returns parser for markdown', () => expect(getParser('text/markdown')).toBeDefined())
  it('returns null for unsupported type', () => expect(getParser('video/mp4')).toBeNull())
})

describe('parser output', () => {
  it('parseTxt returns content as string', async () => {
    const { parseTxt } = await import('@/lib/parsers/txt')
    const buf = Buffer.from('Hello world')
    const result = await parseTxt(buf)
    expect(result).toBe('Hello world')
  })

  it('parseMarkdown strips HTML tags', async () => {
    const { parseMarkdown } = await import('@/lib/parsers/markdown')
    const buf = Buffer.from('# Hello\n\nWorld paragraph.')
    const result = await parseMarkdown(buf)
    expect(result).not.toContain('<h1>')
    expect(result).toContain('Hello')
    expect(result).toContain('World')
  })
})
