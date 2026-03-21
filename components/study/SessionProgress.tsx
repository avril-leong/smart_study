import { ProgressBar } from '@/components/ui/ProgressBar'

interface Props { current: number; total: number; correct: number; studySetName: string }

export function SessionProgress({ current, total, correct, studySetName }: Props) {
  return (
    <div className="mb-8">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>{studySetName}</span>
        <span className="font-display font-bold text-sm">
          <span style={{ color: 'var(--accent-cyan)' }}>{current}</span>
          <span style={{ color: 'var(--text-muted)' }}>/{total}</span>
        </span>
      </div>
      <ProgressBar value={current} max={total} />
      <p className="text-xs mt-2 text-right" style={{ color: 'var(--success)' }}>
        {correct} correct
      </p>
    </div>
  )
}
