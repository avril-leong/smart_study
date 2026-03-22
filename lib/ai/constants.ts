// lib/ai/constants.ts
// No server-only imports — safe to use in both server and client components

export const DEFAULT_BASE_PROMPT = `Generate {n} quiz questions from the text below.
Distribute types: 70% multiple choice, 30% short answer.
Short answer questions should have brief, specific answers suitable for exact matching.`
