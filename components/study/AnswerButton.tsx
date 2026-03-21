'use client'
import { motion } from 'framer-motion'

const COLORS = ['var(--answer-a)', 'var(--answer-b)', 'var(--answer-c)', 'var(--answer-d)']
const LABELS = ['A', 'B', 'C', 'D']

interface Props {
  index: number
  text: string
  state: 'idle' | 'correct' | 'wrong' | 'reveal'
  onClick: () => void
  disabled: boolean
}

export function AnswerButton({ index, text, state, onClick, disabled }: Props) {
  const color = COLORS[index]
  const bg = state === 'correct' ? 'var(--success)'
           : state === 'wrong'   ? 'var(--error)'
           : state === 'reveal'  ? color + '40'
           : color + '22'
  const border = state === 'correct' ? 'var(--success)'
               : state === 'wrong'   ? 'var(--error)'
               : color

  return (
    <motion.button
      onClick={onClick} disabled={disabled}
      whileHover={!disabled ? { scale: 1.02 } : {}}
      whileTap={!disabled ? { scale: 0.98 } : {}}
      animate={state === 'wrong' ? { x: [0, -6, 6, -4, 4, 0] } : {}}
      className="w-full text-left px-5 py-4 rounded-xl border-2 font-body text-sm transition-colors disabled:cursor-not-allowed"
      style={{ background: bg, borderColor: border, color: 'var(--text-primary)' }}>
      <span className="font-display font-bold mr-3" style={{ color: border }}>{LABELS[index]}</span>
      {text}
    </motion.button>
  )
}
