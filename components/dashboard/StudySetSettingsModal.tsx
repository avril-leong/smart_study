'use client'
import { useState, useEffect } from 'react'
import type { StudySet, Subject } from '@/types'

interface Props {
  studySet: StudySet
  subjects: Subject[]
  globalCustomPrompt: string
  onClose: () => void
  onSaved: (updated: Partial<StudySet>) => void
  onDelete: () => void
  onRefresh: () => void
  onAddDocument: () => void
}

const QUESTION_COUNTS = [10, 25, 50] as const

export function StudySetSettingsModal({
  studySet, subjects, globalCustomPrompt,
  onClose, onSaved, onDelete, onRefresh, onAddDocument,
}: Props) {
  const [name, setName] = useState(studySet.name)
  const [subjectId, setSubjectId] = useState(studySet.subject_id ?? '')
  const [prompt, setPrompt] = useState(studySet.custom_prompt ?? '')
  const [questionCount, setQuestionCount] = useState<number>(studySet.question_count_pref ?? 25)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [focusLessonContent, setFocusLessonContent] = useState(studySet.focus_lesson_content ?? true)

  // Escape key + body scroll lock
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => {
      document.body.style.overflow = ''
      document.removeEventListener('keydown', handler)
    }
  }, [onClose])

  async function save() {
    if (!name.trim()) return
    setSaving(true)
    setError('')
    const res = await window.fetch(`/api/study-sets/${studySet.id}/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.trim(),
        subjectId: subjectId || null,
        customPrompt: prompt.trim() || null,
        questionCountPref: questionCount,
        focusLessonContent,
      }),
    })
    if (!res.ok) {
      const d = await res.json()
      setError(d.error ?? 'Save failed')
    } else {
      onSaved({
        name: name.trim(),
        subject_id: subjectId || null,
        custom_prompt: prompt.trim() || null,
        question_count_pref: questionCount,
        focus_lesson_content: focusLessonContent,
      })
    }
    setSaving(false)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
    >
      <div
        className="w-full sm:max-w-md mx-0 sm:mx-4 rounded-t-2xl sm:rounded-2xl flex flex-col"
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--bg-border)',
          maxHeight: '92vh',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--bg-border)' }}>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest mb-0.5"
              style={{ color: 'var(--text-muted)' }}>Study Set</p>
            <h2 id="settings-modal-title" className="font-display font-bold text-lg leading-tight">{studySet.name}</h2>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-lg transition-colors hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-cyan)]"
            style={{ color: 'var(--text-muted)' }}
            aria-label="Close"
          >✕</button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto px-6 py-5 space-y-6 flex-1">

          {/* Name */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest mb-2"
              style={{ color: 'var(--text-muted)' }}>Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={200}
              className="w-full rounded-lg px-3 py-2.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-cyan)]"
              style={{
                background: 'var(--bg-base)',
                border: '1px solid var(--bg-border)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          {/* Subject */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest mb-2"
              style={{ color: 'var(--text-muted)' }}>Subject</label>
            <select
              value={subjectId}
              onChange={e => setSubjectId(e.target.value)}
              className="w-full rounded-lg px-3 py-2.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-cyan)]"
              style={{
                background: 'var(--bg-base)',
                border: '1px solid var(--bg-border)',
                color: 'var(--text-primary)',
              }}
            >
              <option value="">Uncategorized</option>
              {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <div style={{ borderTop: '1px solid var(--bg-border)' }} />

          {/* Custom Instructions */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest mb-1"
              style={{ color: 'var(--text-muted)' }}>Custom Instructions</label>
            <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
              Overrides global instructions for this set only. Applied on next generation.
            </p>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder={globalCustomPrompt || 'e.g. Focus on key definitions, generate harder questions'}
              className="w-full rounded-lg px-3 py-2 text-sm resize-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-cyan)]"
              style={{
                background: 'var(--bg-base)',
                border: '1px solid var(--bg-border)',
                color: 'var(--text-primary)',
                fontFamily: 'inherit',
              }}
            />
            <div className="flex justify-between mt-1">
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{prompt.length} / 500</span>
              {prompt && (
                <button type="button" onClick={() => setPrompt('')}
                  className="text-xs underline" style={{ color: 'var(--text-muted)' }}>
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Focus lesson content */}
          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="focus-lesson-content-switch" className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                Focus on lesson content only
              </label>
              <button
                id="focus-lesson-content-switch"
                type="button"
                role="switch"
                aria-checked={focusLessonContent}
                onClick={() => setFocusLessonContent(v => !v)}
                className="relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-cyan)]"
                style={{
                  background: focusLessonContent ? 'var(--accent-cyan)' : 'var(--bg-border)',
                }}
              >
                <span
                  className="inline-block h-5 w-5 rounded-full transition-transform"
                  style={{
                    background: 'var(--text-primary)',
                    transform: focusLessonContent ? 'translate(21px, 2px)' : 'translate(2px, 2px)',
                  }}
                />
              </button>
            </div>
            <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
              The AI will attempt to skip administrative content such as deadlines and course schedules. Results may not be perfect.
            </p>
          </div>

          {/* Question count */}
          <div>
            <p className="block text-xs font-semibold uppercase tracking-widest mb-2"
              style={{ color: 'var(--text-muted)' }}>Questions per Generation</p>
            <div
              className="flex rounded-lg overflow-hidden"
              style={{ border: '1px solid var(--bg-border)' }}
              role="group"
              aria-label="Questions per generation"
            >
              {QUESTION_COUNTS.map((n, i) => (
                <button
                  key={n}
                  onClick={() => setQuestionCount(n)}
                  aria-pressed={questionCount === n}
                  className="flex-1 py-3 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[var(--accent-cyan)]"
                  style={{
                    background: questionCount === n ? 'var(--accent-cyan)' : 'var(--bg-base)',
                    color: questionCount === n ? 'var(--text-on-accent)' : 'var(--text-muted)',
                    borderRight: i < QUESTION_COUNTS.length - 1 ? '1px solid var(--bg-border)' : 'none',
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--bg-border)' }} />

          {/* Document & regenerate actions */}
          <div className="space-y-2">
            <button
              onClick={onAddDocument}
              className="w-full py-3 px-3 rounded-lg text-sm text-left font-medium transition-colors hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-cyan)]"
              style={{
                background: 'var(--bg-base)',
                border: '1px solid var(--bg-border)',
                color: 'var(--text-primary)',
              }}
            >
              + Add Document
            </button>
            <button
              onClick={onRefresh}
              className="w-full py-3 px-3 rounded-lg text-sm text-left font-medium transition-colors hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-cyan)]"
              style={{
                background: 'var(--bg-base)',
                border: '1px solid var(--bg-border)',
                color: 'var(--text-muted)',
              }}
            >
              ↻ Regenerate Questions
            </button>
          </div>

          {/* Delete */}
          <div>
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="w-full py-3 rounded-lg text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--error)]"
                style={{ border: '1px solid var(--error)', color: 'var(--error)' }}
              >
                Delete Study Set
              </button>
            ) : (
              <div className="rounded-lg p-4 space-y-3"
                style={{ background: 'var(--bg-base)', border: '1px solid var(--error)' }}>
                <p className="text-sm" style={{ color: 'var(--error)' }}>
                  Permanently deletes all questions and documents. This cannot be undone.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={onDelete}
                    className="flex-1 py-2.5 rounded-lg text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--error)]"
                    style={{ background: 'var(--error)', color: 'var(--text-on-accent)' }}
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="flex-1 py-2.5 rounded-lg text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-cyan)]"
                    style={{ border: '1px solid var(--bg-border)', color: 'var(--text-muted)' }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {error && <p className="text-sm" style={{ color: 'var(--error)' }}>{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 shrink-0"
          style={{ borderTop: '1px solid var(--bg-border)' }}>
          <button
            onClick={save}
            disabled={saving || !name.trim()}
            className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-cyan)]"
            style={{
              background: 'var(--accent-cyan)',
              color: 'var(--text-on-accent)',
              opacity: saving || !name.trim() ? 0.5 : 1,
            }}
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
          <button
            onClick={onClose}
            className="py-2.5 px-4 rounded-lg text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-cyan)]"
            style={{ border: '1px solid var(--bg-border)', color: 'var(--text-muted)' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
