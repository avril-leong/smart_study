// components/dashboard/StudySetCard.tsx
'use client'
import Link from 'next/link'
import { Badge } from '@/components/ui/Badge'
import { ProgressRing } from '@/components/ui/ProgressRing'
import type { StudySet } from '@/types'

interface Props {
  studySet: StudySet
  onOpenSettings: () => void
}

export function StudySetCard({ studySet, onOpenSettings }: Props) {
  const mastery = studySet.mastery ?? 0
  const lastStudied = studySet.last_studied_at
    ? new Date(studySet.last_studied_at).toLocaleDateString()
    : 'Never'
  const docCount = studySet.documents.length

  return (
    <div className="rounded-xl border p-4 flex items-start gap-4"
      style={{ background: 'var(--bg-surface)', borderColor: 'var(--bg-border)' }}>
      <ProgressRing value={mastery} max={100} size={52} />
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <span className="font-display font-semibold leading-snug">{studySet.name}</span>
          <button
            onClick={onOpenSettings}
            className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center transition-colors hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-cyan)]"
            style={{ color: 'var(--text-muted)' }}
            title="Settings"
            aria-label="Open settings"
          >
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M7.5 9.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M6.09 1.5h2.82l.5 1.67c.4.16.77.38 1.1.64l1.72-.48 1.41 2.44-1.3 1.17c.04.2.06.41.06.56s-.02.36-.06.56l1.3 1.17-1.41 2.44-1.72-.48c-.33.26-.7.48-1.1.64l-.5 1.67H6.09l-.5-1.67c-.4-.16-.77-.38-1.1-.64l-1.72.48L1.36 9.06l1.3-1.17A4 4 0 0 1 2.6 7.5c0-.15.02-.36.06-.56L1.36 5.77l1.41-2.44 1.72.48c.33-.26.7-.48 1.1-.64l.5-1.67Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>

        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <Badge label={`${docCount} ${docCount === 1 ? 'doc' : 'docs'}`} />
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {studySet.question_count} questions · Last studied {lastStudied}
          </span>
        </div>

        {studySet.generation_status === 'error' && (
          <p className="text-xs mt-1" style={{ color: 'var(--error)' }}>Generation failed</p>
        )}
        {studySet.generation_status === 'processing' && (
          <p className="text-xs mt-1 flex items-center gap-1.5" style={{ color: 'var(--accent-amber)' }}>
            <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--accent-amber)' }} />
            Generating{(studySet.question_count ?? 0) > 0 ? ` · ${studySet.question_count} so far` : '…'}
          </p>
        )}

        {studySet.generation_status === 'done' && (
          <div className="flex gap-2 mt-3">
            <Link
              href={`/study/${studySet.id}`}
              className="px-3 py-1 rounded-lg text-xs font-semibold"
              style={{ background: 'var(--accent-cyan)', color: 'var(--text-on-accent)' }}
            >
              Study
            </Link>
            <Link
              href={`/study/${studySet.id}/history`}
              className="px-3 py-1 rounded-lg text-xs"
              style={{ color: 'var(--accent-cyan)', border: '1px solid var(--accent-cyan)' }}
            >
              History
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
