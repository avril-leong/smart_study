export function gradeShortAnswer(given: string | null | undefined, correct: string | null | undefined): boolean {
  if (!given || !correct) return false
  const normalize = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ')
  return normalize(given) === normalize(correct)
}
