export const MAX_INPUT_CHARS = 15000

// NOTE: Whitespace at chunk boundaries is trimmed intentionally.
// This is acceptable for study document text where boundary whitespace is not meaningful.
export function chunkText(text: string, maxChars = 3000, maxTotal = MAX_INPUT_CHARS): string[] {
  const capped = text.slice(0, maxTotal)
  if (capped.length <= maxChars) return [capped]

  const chunks: string[] = []
  let remaining = capped

  while (remaining.length > 0) {
    if (remaining.length <= maxChars) {
      chunks.push(remaining)
      break
    }
    let bp = remaining.lastIndexOf('.', maxChars)
    if (bp === -1 || bp < maxChars * 0.5) bp = remaining.lastIndexOf(' ', maxChars)
    if (bp === -1) bp = maxChars
    chunks.push(remaining.slice(0, bp + 1).trim())
    remaining = remaining.slice(bp + 1).trim()
  }

  return chunks
}
