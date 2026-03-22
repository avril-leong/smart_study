// app/dashboard/page.tsx
'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useStudySets } from '@/hooks/useStudySets'
import { SubjectGroup } from '@/components/dashboard/SubjectGroup'
import { AddDocumentModal } from '@/components/dashboard/AddDocumentModal'
import { Spinner } from '@/components/ui/Spinner'
import { Button } from '@/components/ui/Button'
import type { StudySet } from '@/types'

export default function DashboardPage() {
  const {
    studySets, subjects, loading,
    renameSet, deleteSet, assignSubject, refreshSet, updateSetStatus, refresh,
  } = useStudySets()

  const [addDocTarget, setAddDocTarget] = useState<StudySet | null>(null)

  const grouped = subjects.map(sub => ({
    subject: sub,
    sets: studySets.filter(s => s.subject_id === sub.id),
  }))
  const uncategorised = studySets.filter(s => !s.subject_id)

  function handleAddDocument(id: string) {
    const set = studySets.find(s => s.id === id)
    if (set) setAddDocTarget(set)
  }

  return (
    <main className="min-h-screen p-6 max-w-3xl mx-auto">
      <header className="flex items-center justify-between mb-10">
        <h1 className="font-display text-4xl font-extrabold" style={{ color: 'var(--accent-cyan)' }}>
          SmartStudy
        </h1>
        <div className="flex gap-3">
          <Link href="/settings"><Button variant="ghost" size="sm">Settings</Button></Link>
          <Link href="/upload"><Button size="sm">+ New Study Set</Button></Link>
        </div>
      </header>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner size={32} /></div>
      ) : studySets.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-lg mb-4" style={{ color: 'var(--text-muted)' }}>No study sets yet.</p>
          <Link href="/upload"><Button>Upload your first file</Button></Link>
        </div>
      ) : (
        <>
          {grouped.map(({ subject, sets }) => (
            <SubjectGroup key={subject.id} title={subject.name} color={subject.color}
              studySets={sets} subjects={subjects}
              onRename={renameSet} onDelete={deleteSet}
              onAssignSubject={assignSubject} onRefresh={refreshSet}
              onAddDocument={handleAddDocument} />
          ))}
          <SubjectGroup title="Uncategorised" studySets={uncategorised} subjects={subjects}
            onRename={renameSet} onDelete={deleteSet}
            onAssignSubject={assignSubject} onRefresh={refreshSet}
            onAddDocument={handleAddDocument} />
        </>
      )}

      {addDocTarget && (
        <AddDocumentModal
          studySet={addDocTarget}
          onClose={() => { setAddDocTarget(null); refresh() }}
          onStatusChange={updateSetStatus}
        />
      )}
    </main>
  )
}
