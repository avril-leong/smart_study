// In-process sliding-window rate limiter, keyed per caller (e.g. `generate:${userId}`).
// NOTE: state lives in this instance's memory only — it does not coordinate across
// multiple server instances. That's an acceptable trade-off for a simple, dependency-free
// guard against a single abusive client; if abuse persists across instances, replace the
// Map below with a shared store (e.g. Upstash Redis).
const hits = new Map<string, number[]>()

export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const timestamps = (hits.get(key) ?? []).filter(t => now - t < windowMs)

  if (timestamps.length >= limit) {
    hits.set(key, timestamps)
    return false
  }

  timestamps.push(now)
  hits.set(key, timestamps)
  return true
}
