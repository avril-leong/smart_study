import { parsePdf } from './pdf'
import { parseTxt } from './txt'
import { parseDocx } from './docx'
import { parsePptx } from './pptx'
import { parseMarkdown } from './markdown'

const PARSERS: Record<string, (buf: Buffer) => Promise<string>> = {
  'application/pdf': parsePdf,
  'text/plain': parseTxt,
  'text/markdown': parseMarkdown,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': parseDocx,
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': parsePptx,
}

export const SUPPORTED_TYPES = Object.keys(PARSERS)

export function getParser(mimeType: string) {
  return PARSERS[mimeType] ?? null
}

export async function parseFile(buffer: Buffer, mimeType: string): Promise<string> {
  const parser = getParser(mimeType)
  if (!parser) throw new Error(`Unsupported file type: ${mimeType}`)
  const text = await parser(buffer)
  if (!text.trim()) throw new Error('Could not extract text from this file')
  return text
}
