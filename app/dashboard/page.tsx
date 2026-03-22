// app/dashboard/page.tsx
'use client'
import Link from 'next/link'
import { useStudySets } from '@/hooks/useStudySets'
import { SubjectGroup } from '@/components/dashboard/SubjectGroup'
import { Spinner } from '@/components/ui/Spinner'
import { Button } from '@/components/ui/Button'

export default function DashboardPage() {
  const { studySets, subjects, loading } = useStudySets()

  const grouped = subjects.map(sub => ({
    subject: sub,
    sets: studySets.filter(s => s.subject_id === sub.id),
  }))
  const uncategorised = studySets.filter(s => !s.subject_id)

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
              studySets={sets} subjects={subjects} />
          ))}
          <SubjectGroup title="Uncategorised" studySets={uncategorised} subjects={subjects} />
        </>
      )}
    </main>
  )
}
