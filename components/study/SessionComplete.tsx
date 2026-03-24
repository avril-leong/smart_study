import { Button } from '@/components/ui/Button'
import Link from 'next/link'
import type { Question } from '@/types'

interface Props {
  studySetId: string
  score: number
  total: number
  weakQuestions: Pick<Question, 'id' | 'question_text'>[]
}

const TIERS = {
  excellent: { headline: 'Sharp work.', barColor: 'var(--success)' },
  good:      { headline: 'Getting there.', barColor: 'var(--accent-amber)' },
  early:     { headline: 'Keep at it.', barColor: 'var(--error)' },
} as const

export function SessionComplete({ studySetId, score, total, weakQuestions }: Props) {
  const pct = total > 0 ? Math.round((score / total) * 100) : 0
  const tier = pct >= 80 ? 'excellent' : pct >= 60 ? 'good' : 'early'
  const { headline, barColor } = TIERS[tier]

  return (
    <div className="w-full max-w-md mx-auto pt-8">

      {/* Score — horizontal bar instead of hero metric */}
      <div className="mb-10">
        <div className="flex items-baseline justify-between mb-3">
          <h1 className="font-display text-2xl font-bold">{headline}</h1>
          <span className="font-display font-bold text-lg" style={{ color: barColor }}>
            {pct}%
          </span>
        </div>
        <div className="w-full h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-border)' }}>
          <div
            className="h-full w-full rounded-full"
            style={{
              background: barColor,
              transform: `scaleX(${pct / 100})`,
              transformOrigin: 'left',
              transition: 'transform 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
              willChange: 'transform',
            }}
          />
        </div>
        <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
          {score} of {total} correct
        </p>
      </div>

      {weakQuestions.length > 0 && (
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-widest mb-3"
            style={{ color: 'var(--text-muted)' }}>
            Worth reviewing
          </p>
          <ul className="space-y-2">
            {weakQuestions.map(q => (
              <li
                key={q.id}
                className="text-sm py-2.5 px-3 rounded-lg"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--bg-border)' }}
              >
                {q.question_text}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {weakQuestions.length > 0 && (
          <Link href={`/study/${studySetId}?practice=true`}>
            <Button className="w-full">Practise weak spots</Button>
          </Link>
        )}
        <Link href={`/study/${studySetId}`}>
          <Button variant={weakQuestions.length > 0 ? 'ghost' : 'primary'} className="w-full">
            Study again
          </Button>
        </Link>
        <Link href="/dashboard">
          <Button variant="ghost" className="w-full">Back to dashboard</Button>
        </Link>
      </div>
    </div>
  )
}
