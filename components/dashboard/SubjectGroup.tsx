'use client'
import { useState } from 'react'
import { StudySetCard } from './StudySetCard'
import type { StudySet, Subject } from '@/types'

interface Props {
  title: string
  color?: string
  studySets: StudySet[]
  subjects: Subject[]
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
  onAssignSubject: (id: string, subjectId: string | null) => void
  onRefresh: (id: string) => void
}

export function SubjectGroup({ title, color, studySets, subjects, onRename, onDelete, onAssignSubject, onRefresh }: Props) {
  const [open, setOpen] = useState(true)
  if (studySets.length === 0) return null

  return (
    <section className="mb-8">
      <button className="flex items-center gap-2 mb-3 group" onClick={() => setOpen(o => !o)}>
        {color && <span className="w-3 h-3 rounded-full" style={{ background: color }} />}
        <h2 className="font-display font-bold text-lg">{title}</h2>
        <span style={{ color: 'var(--text-muted)' }} className="text-sm">({studySets.length})</span>
        <span style={{ color: 'var(--text-muted)' }}>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="space-y-3">
          {studySets.map(s => (
            <StudySetCard key={s.id} studySet={s} subjects={subjects}
              onRename={name => onRename(s.id, name)}
              onDelete={() => onDelete(s.id)}
              onRefresh={() => onRefresh(s.id)}
              onAssignSubject={subjectId => onAssignSubject(s.id, subjectId)} />
          ))}
        </div>
      )}
    </section>
  )
}
