'use client'
import Link from 'next/link'
import { Badge } from '@/components/ui/Badge'
import { ProgressRing } from '@/components/ui/ProgressRing'
import { RenameInput } from './RenameInput'
import type { StudySet, Subject } from '@/types'

const FILE_TYPE_LABELS: Record<string, string> = {
  'application/pdf': 'PDF',
  'text/plain': 'TXT',
  'text/markdown': 'MD',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PPTX',
}

interface Props {
  studySet: StudySet
  subjects: Subject[]
  onRename: (name: string) => void
  onDelete: () => void
  onRefresh: () => void
  onAssignSubject: (subjectId: string | null) => void
}

export function StudySetCard({ studySet, subjects, onRename, onDelete, onRefresh, onAssignSubject }: Props) {
  const mastery = 0 // placeholder — mastery % requires performance data
  const lastStudied = studySet.last_studied_at
    ? new Date(studySet.last_studied_at).toLocaleDateString()
    : 'Never'

  return (
    <div className="rounded-xl border p-4 flex items-start gap-4 group"
      style={{ background: 'var(--bg-surface)', borderColor: 'var(--bg-border)' }}>
      <ProgressRing value={mastery} max={100} size={52} />
      <div className="flex-1 min-w-0">
        <RenameInput value={studySet.name} onSave={onRename} />
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <Badge label={studySet.file_type ? (FILE_TYPE_LABELS[studySet.file_type] ?? studySet.file_type) : 'Unknown'} />
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {studySet.question_count} questions · Last studied {lastStudied}
          </span>
        </div>
        <select className="mt-2 text-xs rounded-md px-2 py-1"
          style={{ background: 'var(--bg-base)', border: '1px solid var(--bg-border)', color: 'var(--text-muted)' }}
          value={studySet.subject_id ?? ''}
          onChange={e => onAssignSubject(e.target.value || null)}>
          <option value="">Uncategorised</option>
          {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <div className="flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        {studySet.generation_status === 'done' && (
          <Link href={`/study/${studySet.id}`}
            className="px-3 py-1 rounded-lg text-xs font-semibold"
            style={{ background: 'var(--accent-cyan)', color: 'var(--bg-base)' }}>
            Study
          </Link>
        )}
        {studySet.generation_status === 'error' && (
          <span className="text-xs" style={{ color: 'var(--error)' }}>Generation failed</span>
        )}
        {studySet.generation_status === 'processing' && (
          <span className="text-xs" style={{ color: 'var(--accent-amber)' }}>Generating…</span>
        )}
        <button onClick={onRefresh} className="px-3 py-1 rounded-lg text-xs"
          style={{ color: 'var(--text-muted)', border: '1px solid var(--bg-border)' }}>
          Refresh
        </button>
        <button onClick={onDelete} className="px-3 py-1 rounded-lg text-xs"
          style={{ color: 'var(--error)', border: '1px solid var(--error)' }}>
          Delete
        </button>
      </div>
    </div>
  )
}
