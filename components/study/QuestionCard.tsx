'use client'
import { motion } from 'framer-motion'
import { AnswerButton } from './AnswerButton'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useState } from 'react'
import { gradeShortAnswer } from '@/lib/ai/grade-short-answer'
import type { Question } from '@/types'

interface Props {
  question: Question
  onAnswer: (answer: string) => void
  answered: boolean
  correctAnswer: string
  givenAnswer: string
}

export function QuestionCard({ question, onAnswer, answered, correctAnswer, givenAnswer }: Props) {
  const [shortInput, setShortInput] = useState('')

  const getButtonState = (label: string) => {
    if (!answered) return 'idle'
    if (label === correctAnswer) return 'correct'
    if (label === givenAnswer) return 'wrong'
    return 'reveal'
  }

  return (
    <motion.div key={question.id}
      initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="w-full">
      <div className="mb-8 px-2">
        <p className="text-xs font-semibold uppercase tracking-widest mb-3"
          style={{ color: 'var(--accent-cyan)' }}>
          {question.type === 'mcq' ? 'Multiple Choice' : 'Short Answer'}
        </p>
        <p className="font-display text-2xl font-bold leading-tight">{question.question_text}</p>
      </div>

      {question.type === 'mcq' && question.options && (
        <div className="space-y-3">
          {question.options.map((opt, i) => (
            <AnswerButton key={opt.label} index={i} text={opt.text}
              state={getButtonState(opt.label)}
              onClick={() => onAnswer(opt.label)} disabled={answered} />
          ))}
        </div>
      )}

      {question.type === 'short_answer' && (
        <div className="space-y-4">
          <Input value={shortInput} onChange={e => setShortInput(e.target.value)}
            placeholder="Type your answer…" disabled={answered}
            onKeyDown={e => { if (e.key === 'Enter' && !answered) onAnswer(shortInput) }} />
          {!answered && (
            <Button onClick={() => onAnswer(shortInput)} disabled={!shortInput.trim()}>
              Submit Answer
            </Button>
          )}
          {answered && (
            <div className="p-4 rounded-xl border"
              style={{ borderColor: gradeShortAnswer(givenAnswer, correctAnswer) ? 'var(--success)' : 'var(--error)',
                background: 'var(--bg-surface)' }}>
              <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Correct answer:</p>
              <p className="font-display font-bold" style={{ color: 'var(--success)' }}>{correctAnswer}</p>
            </div>
          )}
        </div>
      )}
    </motion.div>
  )
}
