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
 * Strips control characters (except \n and \t) from arbitrary text.
 * Safe to apply to any text (never throws) — use this for content that should be
 * normalized but not rejected, e.g. extracted document text fed to an LLM.
 */
export function stripControlChars(input: string): string {
  // eslint-disable-next-line no-control-regex
  return input.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '')
}

/**
 * Sanitizes user-supplied prompt text.
 * - Trims whitespace
 * - Strips control characters (except \n and \t)
 * - Truncates to maxLength
 * - Throws ValidationError if input contains prompt injection patterns
 */
export function sanitizePrompt(input: string, maxLength: number): string {
  const trimmed = stripControlChars(input).trim()

  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(trimmed)) {
      throw new ValidationError('Prompt contains disallowed content')
    }
  }

  return trimmed.slice(0, maxLength)
}
