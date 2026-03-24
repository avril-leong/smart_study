// app/dashboard/page.tsx
'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useStudySets } from '@/hooks/useStudySets'
import { SubjectGroup } from '@/components/dashboard/SubjectGroup'
import { AddDocumentModal } from '@/components/dashboard/AddDocumentModal'
import { StudySetSettingsModal } from '@/components/dashboard/StudySetSettingsModal'
import { Spinner } from '@/components/ui/Spinner'
import { Button } from '@/components/ui/Button'
import type { StudySet } from '@/types'

export default function DashboardPage() {
  const {
    studySets, subjects, loading,
    deleteSet, refreshSet, updateSetStatus, refresh,
  } = useStudySets()

  const [settingsTarget, setSettingsTarget] = useState<StudySet | null>(null)
  const [addDocTarget, setAddDocTarget] = useState<StudySet | null>(null)
  const [globalCustomPrompt, setGlobalCustomPrompt] = useState('')

  useEffect(() => {
    window.fetch('/api/settings/ai')
      .then(r => r.json())
      .then(d => setGlobalCustomPrompt(d.globalCustomPrompt ?? ''))
  }, [])

  const grouped = subjects.map(sub => ({
    subject: sub,
    sets: studySets.filter(s => s.subject_id === sub.id),
  }))
  const uncategorised = studySets.filter(s => !s.subject_id)

  function handleOpenSettings(id: string) {
    const set = studySets.find(s => s.id === id)
    if (set) setSettingsTarget(set)
  }

  return (
    <main id="main-content" className="min-h-screen p-6 max-w-3xl mx-auto">
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
        <div className="py-16 max-w-sm">
          <h2 className="font-display text-xl font-bold mb-2">Your study sets will appear here</h2>
          <p className="text-sm mb-8" style={{ color: 'var(--text-muted)' }}>
            Upload a PDF or document and SmartStudy generates quiz questions automatically.
          </p>
          <div className="space-y-4 mb-8">
            {([
              'Upload a lecture PDF or document',
              'AI generates quiz questions from your material',
              'Study with spaced repetition — focus on what you haven\'t mastered yet',
            ] as const).map((text, i) => (
              <div key={i} className="flex items-start gap-3">
                <span
                  className="shrink-0 w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center"
                  style={{ background: 'var(--accent-cyan)', color: 'var(--text-on-accent)' }}
                  aria-hidden="true"
                >
                  {i + 1}
                </span>
                <p className="text-sm pt-0.5" style={{ color: 'var(--text-muted)' }}>{text}</p>
              </div>
            ))}
          </div>
          <Link href="/upload"><Button className="w-full">Upload your first file</Button></Link>
        </div>
      ) : (
        <>
          {grouped.map(({ subject, sets }) => (
            <SubjectGroup key={subject.id} title={subject.name} color={subject.color}
              studySets={sets}
              onOpenSettings={handleOpenSettings} />
          ))}
          <SubjectGroup title="Uncategorized" studySets={uncategorised}
            onOpenSettings={handleOpenSettings} />
        </>
      )}

      {settingsTarget && (
        <StudySetSettingsModal
          studySet={settingsTarget}
          subjects={subjects}
          globalCustomPrompt={globalCustomPrompt}
          onClose={() => setSettingsTarget(null)}
          onSaved={() => {
            refresh()
            setSettingsTarget(null)
          }}
          onDelete={() => {
            deleteSet(settingsTarget.id)
            setSettingsTarget(null)
          }}
          onRefresh={() => {
            refreshSet(settingsTarget.id)
            setSettingsTarget(null)
          }}
          onAddDocument={() => {
            const target = settingsTarget
            setSettingsTarget(null)
            setAddDocTarget(target)
          }}
        />
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
