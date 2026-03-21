import { Button } from '@/components/ui/Button'
import Link from 'next/link'
import type { Question } from '@/types'

interface Props {
  studySetId: string
  score: number
  total: number
  weakQuestions: Pick<Question, 'id' | 'question_text'>[]
}

export function SessionComplete({ studySetId, score, total, weakQuestions }: Props) {
  const pct = Math.round((score / total) * 100)
  return (
    <div className="w-full max-w-md text-center mx-auto">
      <h1 className="font-display text-5xl font-extrabold mb-2"
        style={{ color: pct >= 70 ? 'var(--success)' : 'var(--accent-amber)' }}>
        {pct}%
      </h1>
      <p className="text-lg mb-1 font-display font-semibold">{score}/{total} correct</p>
      <p className="text-sm mb-8" style={{ color: 'var(--text-muted)' }}>
        {pct >= 80 ? 'Excellent work!' : pct >= 60 ? 'Good progress!' : 'Keep practising!'}
      </p>
      {weakQuestions.length > 0 && (
        <div className="text-left mb-8 p-4 rounded-xl border"
          style={{ borderColor: 'var(--bg-border)', background: 'var(--bg-surface)' }}>
          <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text-muted)' }}>Topics to review:</p>
          <ul className="space-y-2">
            {weakQuestions.map(q => (
              <li key={q.id} className="text-sm">• {q.question_text}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-col gap-3">
        <Link href={`/study/${studySetId}`}><Button className="w-full">Study Again</Button></Link>
        <Link href="/dashboard"><Button variant="ghost" className="w-full">Back to Dashboard</Button></Link>
      </div>
    </div>
  )
}
