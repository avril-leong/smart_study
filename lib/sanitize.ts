export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

const INJECTION_PATTERNS = [
  /ignore previous instructions/i,
  /disregard/i,
  /you are now/i,
  /system prompt/i,
]

/**
 * Sanitizes user-supplied prompt text.
 * - Trims whitespace
 * - Strips control characters (except \n and \t)
 * - Truncates to maxLength
 * - Throws ValidationError if input contains prompt injection patterns
 */
export function sanitizePrompt(input: string, maxLength: number): string {
  // Strip control chars except newline (\n = 0x0A) and tab (\t = 0x09); also strip DEL
  // eslint-disable-next-line no-control-regex
  const stripped = input.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '')
  const trimmed = stripped.trim()

  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(trimmed)) {
      throw new ValidationError('Prompt contains disallowed content')
    }
  }

  return trimmed.slice(0, maxLength)
}
