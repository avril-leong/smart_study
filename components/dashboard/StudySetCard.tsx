// components/dashboard/StudySetCard.tsx
'use client'
import Link from 'next/link'
import { Badge } from '@/components/ui/Badge'
import { ProgressRing } from '@/components/ui/ProgressRing'
import type { StudySet, Subject } from '@/types'

interface Props {
  studySet: StudySet
  subjects: Subject[]
  onRename: (name: string) => void
  onDelete: () => void
  onRefresh: () => void
  onAssignSubject: (subjectId: string | null) => void
  onAddDocument: () => void
  onEditPrompt: () => void
}

const STATUS_STYLES: Record<string, { label: string; color: string }> = {
  processing: { label: 'Generating…', color: 'var(--accent-amber)' },
  error:      { label: 'Failed',       color: 'var(--error)' },
  pending:    { label: 'Pending',      color: 'var(--text-muted)' },
}

export function StudySetCard({ studySet, subjects, onRename, onDelete, onRefresh, onAssignSubject, onAddDocument, onEditPrompt }: Props) {
  const docCount = studySet.documents.length
  const statusInfo = STATUS_STYLES[studySet.generation_status]

  return (
    <div className="rounded-xl border p-4 flex items-start gap-4 group transition-colors hover:border-[var(--accent-cyan)44]"
      style={{ background: 'var(--bg-surface)', borderColor: 'var(--bg-border)' }}>
      <ProgressRing value={0} max={100} size={48} />

      <div className="flex-1 min-w-0">
        <Link href={`/study-sets/${studySet.id}`}
          className="block font-display font-bold text-base truncate hover:opacity-80 transition-opacity"
          style={{ color: 'var(--text-primary)' }}>
          {studySet.name}
        </Link>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <Badge label={`${docCount} ${docCount === 1 ? 'doc' : 'docs'}`} />
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {studySet.question_count} questions
          </span>
          {statusInfo && (
            <span className="text-xs font-semibold" style={{ color: statusInfo.color }}>
              · {statusInfo.label}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {studySet.generation_status === 'done' && (
          <Link href={`/study/${studySet.id}`}
            className="px-3 py-1.5 rounded-lg text-xs font-bold text-center"
            style={{ background: 'var(--accent-cyan)', color: 'var(--bg-base)' }}>
            Study
          </Link>
        )}
        <Link href={`/study-sets/${studySet.id}`}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-center border"
          style={{ color: 'var(--accent-cyan)', borderColor: 'var(--accent-cyan)55' }}>
          Manage
        </Link>
      </div>
    </div>
  )
}
