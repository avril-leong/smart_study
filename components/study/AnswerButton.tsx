'use client'
import { motion, useReducedMotion } from 'framer-motion'

const COLORS  = ['var(--answer-a)',        'var(--answer-b)',        'var(--answer-c)',        'var(--answer-d)']
const SUBTLE  = ['var(--answer-a-subtle)', 'var(--answer-b-subtle)', 'var(--answer-c-subtle)', 'var(--answer-d-subtle)']
const MID     = ['var(--answer-a-mid)',    'var(--answer-b-mid)',    'var(--answer-c-mid)',    'var(--answer-d-mid)']
const LABELS  = ['A', 'B', 'C', 'D']

interface Props {
  index: number
  text: string
  state: 'idle' | 'correct' | 'wrong' | 'reveal'
  onClick: () => void
  disabled: boolean
}

export function AnswerButton({ index, text, state, onClick, disabled }: Props) {
  const prefersReducedMotion = useReducedMotion()
  const color = COLORS[index]
  const bg = state === 'correct' ? 'var(--success)'
           : state === 'wrong'   ? 'var(--error)'
           : state === 'reveal'  ? MID[index]
           : SUBTLE[index]
  const border = state === 'correct' ? 'var(--success)'
               : state === 'wrong'   ? 'var(--error)'
               : color

  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      whileHover={!disabled && !prefersReducedMotion ? { scale: 1.02 } : {}}
      whileTap={!disabled && !prefersReducedMotion ? { scale: 0.98 } : {}}
      animate={state === 'wrong' && !prefersReducedMotion ? { x: [0, -6, 6, -4, 4, 0] } : {}}
      className="w-full text-left px-5 py-4 rounded-xl border-2 font-body text-sm transition-colors disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-cyan)]"
      style={{ background: bg, borderColor: border, color: 'var(--text-primary)' }}
    >
      <span className="font-display font-bold mr-3" style={{ color: border }}>{LABELS[index]}</span>
      {text}
    </motion.button>
  )
}
