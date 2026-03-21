'use client'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'

interface Props {
  visible: boolean
  feedback: string
  loading: boolean
  isCorrect: boolean
  onNext: () => void
}

export function FeedbackPanel({ visible, feedback, loading, isCorrect, onNext }: Props) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
          exit={{ y: 60, opacity: 0 }} transition={{ duration: 0.35, ease: 'easeOut' }}
          className="mt-6 p-6 rounded-2xl border"
          style={{ background: 'var(--bg-surface)', borderColor: isCorrect ? 'var(--success)' : 'var(--error)' }}>
          <p className="font-display font-bold mb-3" style={{ color: isCorrect ? 'var(--success)' : 'var(--error)' }}>
            {isCorrect ? '✓ Correct' : '✗ Incorrect'}
          </p>
          {loading ? <Spinner /> : (
            <>
              <p className="text-sm leading-relaxed mb-5" style={{ color: 'var(--text-muted)' }}>{feedback}</p>
              <Button onClick={onNext}>Next Question →</Button>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
