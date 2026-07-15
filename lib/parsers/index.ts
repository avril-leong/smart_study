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

// Safely under the upload/process route's maxDuration (60s), so a pathological file
// (e.g. a decompression-bomb-style docx/pptx) fails fast with a clear error instead of
// running until the platform kills the whole request.
const PARSE_TIMEOUT_MS = 45_000
// Bounds memory held for extracted text regardless of how large the source document is.
const MAX_EXTRACTED_CHARS = 2_000_000

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ])
}

export async function parseFile(buffer: Buffer, mimeType: string): Promise<string> {
  const parser = getParser(mimeType)
  if (!parser) throw new Error(`Unsupported file type: ${mimeType}`)
  const text = await withTimeout(parser(buffer), PARSE_TIMEOUT_MS, 'File took too long to process')
  if (!text.trim()) throw new Error('Could not extract text from this file')
  return text.length > MAX_EXTRACTED_CHARS
    ? text.slice(0, MAX_EXTRACTED_CHARS) + '\n\n[Content truncated — document exceeded the size limit for processing]'
    : text
}
