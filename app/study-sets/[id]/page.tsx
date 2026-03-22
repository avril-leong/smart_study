'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { DropZone } from '@/components/upload/DropZone'
import type { StudySet, Subject, GenerationStatus } from '@/types'

// ── File type config ──────────────────────────────────────────────────────────
const FILE_TYPES: Record<string, { label: string; color: string }> = {
  'application/pdf': { label: 'PDF', color: '#f43f5e' },
  'text/plain': { label: 'TXT', color: '#64748b' },
  'text/markdown': { label: 'MD', color: '#a78bfa' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { label: 'DOC', color: '#00c9ff' },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': { label: 'PPT', color: '#f59e0b' },
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

// ── Status indicator ──────────────────────────────────────────────────────────
function StatusPill({ status }: { status: GenerationStatus }) {
  const map = {
    done:       { label: 'Ready',        color: 'var(--success)',      pulse: false },
    processing: { label: 'Generating…',  color: 'var(--accent-amber)', pulse: true  },
    pending:    { label: 'Pending',       color: 'var(--text-muted)',   pulse: false },
    error:      { label: 'Error',         color: 'var(--error)',        pulse: false },
  }[status]

  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold"
      style={{ background: map.color + '18', color: map.color, border: `1px solid ${map.color}44` }}>
      <span className={`w-1.5 h-1.5 rounded-full ${map.pulse ? 'animate-pulse' : ''}`}
        style={{ background: map.color }} />
      {map.label}
    </span>
  )
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-3 mb-4 text-xs font-bold tracking-widest uppercase"
      style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-display)' }}>
      <span className="h-px w-5 flex-shrink-0" style={{ background: 'var(--accent-cyan)' }} />
      {children}
    </h2>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function StudySetPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [studySet, setStudySet] = useState<StudySet | null>(null)
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  // Name editing
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState('')

  // Prompt
  const [prompt, setPrompt] = useState('')
  const [globalPrompt, setGlobalPrompt] = useState('')
  const [savingPrompt, setSavingPrompt] = useState(false)
  const [promptSaved, setPromptSaved] = useState(false)

  // Documents
  const [removingDocId, setRemovingDocId] = useState<string | null>(null)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [uploadedKeys, setUploadedKeys] = useState<Record<string, string>>({})

  // Generation
  const [genMode, setGenMode] = useState<'append' | 'regenerate'>('append')
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState('')
  const [hasKey, setHasKey] = useState(false)

  // Delete
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    const supabase = createClient()
    const [{ data: set }, { data: subs }] = await Promise.all([
      supabase.from('study_sets').select('*, subject:subjects(*)').eq('id', params.id).single(),
      supabase.from('subjects').select('*').order('name'),
    ])

    if (!set) { setNotFound(true); setLoading(false); return }

    const [{ count }, { data: docs }] = await Promise.all([
      supabase.from('questions').select('*', { count: 'exact', head: true }).eq('study_set_id', params.id),
      supabase.from('study_set_documents').select('*').eq('study_set_id', params.id).order('uploaded_at'),
    ])

    const full: StudySet = { ...set, question_count: count ?? 0, documents: docs ?? [] }
    setStudySet(full)
    setNameValue(full.name)
    setPrompt(full.custom_prompt ?? '')
    if (subs) setSubjects(subs)
    setLoading(false)
  }, [params.id])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    window.fetch('/api/settings/ai')
      .then(r => r.json())
      .then(d => { setGlobalPrompt(d.globalCustomPrompt ?? ''); setHasKey(d.hasKey ?? false) })
  }, [])

  // ── Handlers ───────────────────────────────────────────────────────────────
  async function saveName() {
    if (!studySet) return
    const trimmed = nameValue.trim()
    setEditingName(false)
    if (!trimmed || trimmed === studySet.name) return
    await createClient().from('study_sets').update({ name: trimmed }).eq('id', params.id)
    setStudySet(prev => prev ? { ...prev, name: trimmed } : prev)
  }

  async function assignSubject(subjectId: string | null) {
    await createClient().from('study_sets').update({ subject_id: subjectId }).eq('id', params.id)
    setStudySet(prev => prev ? { ...prev, subject_id: subjectId } : prev)
  }

  async function savePrompt() {
    setSavingPrompt(true)
    const res = await window.fetch(`/api/study-sets/${params.id}/prompt`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customPrompt: prompt.trim() || null }),
    })
    setSavingPrompt(false)
    if (res.ok) {
      setStudySet(prev => prev ? { ...prev, custom_prompt: prompt.trim() || null } : prev)
      setPromptSaved(true)
      setTimeout(() => setPromptSaved(false), 2000)
    }
  }

  async function removeDoc(docId: string) {
    setRemovingDocId(docId)
    const res = await window.fetch(`/api/study-sets/${params.id}/documents/${docId}`, { method: 'DELETE' })
    if (res.ok) {
      setStudySet(prev => prev ? { ...prev, documents: prev.documents.filter(d => d.id !== docId) } : prev)
    }
    setRemovingDocId(null)
  }

  function addPendingFiles(incoming: File[]) {
    setPendingFiles(prev => {
      const existing = new Set(prev.map(f => f.name + f.size))
      return [...prev, ...incoming.filter(f => !existing.has(f.name + f.size))]
    })
  }

  async function handleGenerate() {
    if (!hasKey) {
      setGenError('No API key configured — go to Settings → AI Settings.')
      return
    }
    setGenerating(true)
    setGenError('')

    const keys = { ...uploadedKeys }
    for (const file of pendingFiles) {
      const key = file.name + file.size
      if (keys[key]) continue
      const fd = new FormData()
      fd.append('file', file)
      fd.append('studySetId', params.id)
      const res = await window.fetch('/api/upload', { method: 'POST', body: fd })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setGenError(`Upload failed for ${file.name}: ${d.error ?? 'Unknown error'}`)
        setGenerating(false)
        return
      }
      keys[key] = (await res.json()).documentId
      setUploadedKeys({ ...keys })
    }

    const docIds = Object.values(keys)
    const body: Record<string, unknown> = {
      studySetId: params.id,
      mode: pendingFiles.length > 0 ? genMode : 'regenerate',
      customPrompt: prompt.trim() || null,
    }
    if (genMode === 'append' && pendingFiles.length > 0 && docIds.length > 0) body.documentIds = docIds

    const res = await window.fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setGenError(d.error ?? 'Generation failed')
      setGenerating(false)
      return
    }

    setPendingFiles([])
    setUploadedKeys({})
    setGenerating(false)
    await load()
  }

  async function deleteStudySet() {
    setDeleting(true)
    await createClient().from('study_sets').delete().eq('id', params.id)
    router.push('/dashboard')
  }

  // ── Loading / error states ─────────────────────────────────────────────────
  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: 'var(--accent-cyan)', borderTopColor: 'transparent' }} />
      </main>
    )
  }

  if (notFound || !studySet) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="mb-4 text-sm" style={{ color: 'var(--error)' }}>Study set not found.</p>
          <Link href="/dashboard" className="text-sm underline" style={{ color: 'var(--accent-cyan)' }}>
            Back to Dashboard
          </Link>
        </div>
      </main>
    )
  }

  const hasPending = pendingFiles.length > 0

  return (
    <main className="min-h-screen" style={{ background: 'var(--bg-base)' }}>
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .fade-up { animation: fadeUp 0.35s ease both; }
        .delay-1 { animation-delay: 0.07s; }
        .delay-2 { animation-delay: 0.12s; }
        .delay-3 { animation-delay: 0.17s; }
        .delay-4 { animation-delay: 0.22s; }
        .delay-5 { animation-delay: 0.27s; }

        .doc-row { transition: background 0.15s; }
        .doc-row:hover { background: var(--bg-border) !important; }
        .doc-row:hover .doc-remove { opacity: 1 !important; }

        .name-edit-wrapper:hover .rename-hint { opacity: 1; }
      `}</style>

      {/* ── Sticky nav ── */}
      <nav className="sticky top-0 z-20 border-b"
        style={{ background: 'var(--bg-base)dd', backdropFilter: 'blur(12px)', borderColor: 'var(--bg-border)' }}>
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/dashboard"
            className="flex items-center gap-2 text-sm transition-opacity hover:opacity-60"
            style={{ color: 'var(--text-muted)' }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M9 2.5L4.5 7L9 11.5" stroke="currentColor" strokeWidth="1.5"
                strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Dashboard
          </Link>

          <div className="flex items-center gap-2">
            {studySet.generation_status === 'done' && (
              <>
                <Link href={`/study/${studySet.id}/history`}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition-opacity hover:opacity-70"
                  style={{ color: 'var(--text-muted)', borderColor: 'var(--bg-border)' }}>
                  History
                </Link>
                <Link href={`/study/${studySet.id}`}
                  className="px-4 py-1.5 rounded-lg text-xs font-bold transition-opacity hover:opacity-80"
                  style={{ background: 'var(--accent-cyan)', color: 'var(--bg-base)' }}>
                  Study Now →
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 pt-10 pb-20">

        {/* ── Header ── */}
        <header className="mb-10 fade-up">
          <div className="flex items-start justify-between gap-4 mb-3">
            {editingName ? (
              <input
                autoFocus
                value={nameValue}
                onChange={e => setNameValue(e.target.value)}
                onBlur={saveName}
                onKeyDown={e => {
                  if (e.key === 'Enter') saveName()
                  if (e.key === 'Escape') { setNameValue(studySet.name); setEditingName(false) }
                }}
                className="font-display text-3xl font-extrabold bg-transparent outline-none border-b-2 flex-1 min-w-0"
                style={{ color: 'var(--text-primary)', borderColor: 'var(--accent-cyan)' }}
              />
            ) : (
              <div className="name-edit-wrapper flex items-center gap-2 cursor-text flex-1 min-w-0"
                onClick={() => setEditingName(true)}>
                <h1 className="font-display text-3xl font-extrabold truncate"
                  style={{ color: 'var(--text-primary)' }}>
                  {studySet.name}
                </h1>
                <span className="rename-hint text-sm opacity-0 transition-opacity flex-shrink-0"
                  style={{ color: 'var(--text-muted)' }}>✎</span>
              </div>
            )}
            <div className="flex-shrink-0 pt-1">
              <StatusPill status={studySet.generation_status} />
            </div>
          </div>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {studySet.question_count ?? 0} questions
            <span className="mx-2 opacity-40">·</span>
            {studySet.documents.length} {studySet.documents.length === 1 ? 'document' : 'documents'}
            <span className="mx-2 opacity-40">·</span>
            Last studied {studySet.last_studied_at ? fmt(studySet.last_studied_at) : 'Never'}
          </p>
        </header>

        {/* ── Two-column grid ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">

          {/* ── Left: main content ── */}
          <div className="lg:col-span-2 space-y-8">

            {/* Documents */}
            <section className="fade-up delay-1">
              <SectionHead>Documents</SectionHead>

              {studySet.documents.length > 0 ? (
                <ul className="rounded-xl overflow-hidden mb-4"
                  style={{ border: '1px solid var(--bg-border)' }}>
                  {studySet.documents.map((doc, i) => {
                    const ft = FILE_TYPES[doc.file_type] ?? { label: '?', color: 'var(--text-muted)' }
                    const isRemoving = removingDocId === doc.id
                    return (
                      <li key={doc.id}
                        className="doc-row flex items-center gap-3 px-4 py-3"
                        style={{
                          background: 'var(--bg-surface)',
                          borderTop: i > 0 ? '1px solid var(--bg-border)' : undefined,
                          opacity: isRemoving ? 0.5 : 1,
                        }}>
                        <span className="flex-shrink-0 text-xs font-bold px-2 py-0.5 rounded"
                          style={{
                            background: ft.color + '22',
                            color: ft.color,
                            fontFamily: 'monospace',
                            letterSpacing: '0.05em',
                          }}>
                          {ft.label}
                        </span>
                        <span className="flex-1 text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                          {doc.file_name}
                        </span>
                        <span className="flex-shrink-0 text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>
                          {fmt(doc.uploaded_at)}
                        </span>
                        <button
                          onClick={() => removeDoc(doc.id)}
                          disabled={!!removingDocId || generating}
                          className="doc-remove flex-shrink-0 text-xs px-2 py-1 rounded transition-all"
                          style={{
                            color: 'var(--error)',
                            border: '1px solid var(--error)44',
                            opacity: isRemoving ? 1 : 0,
                            cursor: (removingDocId || generating) ? 'not-allowed' : 'pointer',
                          }}>
                          {isRemoving ? '…' : 'Remove'}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
                  No documents yet — drop files below to get started.
                </p>
              )}

              <DropZone multiple onFiles={addPendingFiles} disabled={generating} />

              {hasPending && (
                <ul className="mt-3 space-y-1.5">
                  {pendingFiles.map((f, i) => (
                    <li key={f.name + f.size}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm"
                      style={{ background: 'var(--bg-surface)', border: '1px solid var(--accent-cyan)44' }}>
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ background: 'var(--accent-cyan)' }} />
                      <span className="flex-1 truncate">{f.name}</span>
                      <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                        {(f.size / 1024).toFixed(0)} KB
                      </span>
                      <button onClick={() => setPendingFiles(prev => prev.filter((_, j) => j !== i))}
                        disabled={generating}
                        className="text-xs ml-1 transition-opacity hover:opacity-70"
                        style={{ color: 'var(--error)' }}>
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Generate / Regenerate */}
            <section className="fade-up delay-2 rounded-xl p-5"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--bg-border)' }}>
              <SectionHead>Generate Questions</SectionHead>

              {hasPending && (
                <div className="mb-4 space-y-2 p-3 rounded-lg"
                  style={{ background: 'var(--bg-base)', border: '1px solid var(--bg-border)' }}>
                  <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>
                    HOW TO HANDLE EXISTING QUESTIONS
                  </p>
                  <label className="flex items-center gap-2.5 cursor-pointer text-sm">
                    <input type="radio" name="genMode" value="append"
                      checked={genMode === 'append'} onChange={() => setGenMode('append')} />
                    Add questions from new documents only
                  </label>
                  <label className="flex items-center gap-2.5 cursor-pointer text-sm">
                    <input type="radio" name="genMode" value="regenerate"
                      checked={genMode === 'regenerate'} onChange={() => setGenMode('regenerate')} />
                    Delete all and regenerate from every document
                  </label>
                </div>
              )}

              <button
                onClick={handleGenerate}
                disabled={generating || studySet.generation_status === 'processing'}
                className="w-full py-3 rounded-lg text-sm font-bold transition-opacity hover:opacity-80 disabled:opacity-40"
                style={{ background: 'var(--accent-cyan)', color: 'var(--bg-base)' }}>
                {generating
                  ? 'Working…'
                  : hasPending
                    ? `Upload & Generate  (${pendingFiles.length} new file${pendingFiles.length > 1 ? 's' : ''})`
                    : 'Regenerate All Questions'}
              </button>

              {genError && (
                <p className="mt-3 text-sm" style={{ color: 'var(--error)' }}>{genError}</p>
              )}
            </section>

            {/* Custom Instructions */}
            <section className="fade-up delay-3">
              <SectionHead>Custom Instructions</SectionHead>
              <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
                Overrides your global default for this study set only. Takes effect on the next generation run.
              </p>
              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                rows={4}
                maxLength={500}
                placeholder={globalPrompt || 'e.g. Focus on key definitions, generate harder application questions'}
                className="w-full rounded-xl px-4 py-3 text-sm resize-y"
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--bg-border)',
                  color: 'var(--text-primary)',
                  fontFamily: 'inherit',
                  lineHeight: '1.6',
                }}
              />
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>
                  {prompt.length} / 500
                </span>
                <div className="flex items-center gap-3">
                  {promptSaved && (
                    <span className="text-xs" style={{ color: 'var(--success)' }}>Saved ✓</span>
                  )}
                  {prompt && (
                    <button onClick={() => setPrompt('')} className="text-xs underline"
                      style={{ color: 'var(--text-muted)' }}>
                      Clear
                    </button>
                  )}
                  <button onClick={savePrompt} disabled={savingPrompt}
                    className="px-4 py-1.5 rounded-lg text-xs font-bold transition-opacity hover:opacity-80 disabled:opacity-40"
                    style={{ background: 'var(--accent-cyan)', color: 'var(--bg-base)' }}>
                    {savingPrompt ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            </section>
          </div>

          {/* ── Right sidebar ── */}
          <aside className="space-y-4 fade-up delay-4">

            {/* Quick actions */}
            {studySet.generation_status === 'done' && (
              <div className="space-y-2">
                <Link href={`/study/${studySet.id}`}
                  className="flex items-center justify-between w-full px-4 py-3 rounded-xl text-sm font-bold"
                  style={{ background: 'var(--accent-cyan)', color: 'var(--bg-base)' }}>
                  Study Now
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M3 7h8M8 4l3 3-3 3" stroke="currentColor" strokeWidth="1.5"
                      strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
                <Link href={`/study/${studySet.id}/history`}
                  className="flex items-center justify-between w-full px-4 py-3 rounded-xl text-sm font-semibold border"
                  style={{ color: 'var(--accent-cyan)', borderColor: 'var(--accent-cyan)44' }}>
                  View History
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M3 7h8M8 4l3 3-3 3" stroke="currentColor" strokeWidth="1.5"
                      strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
              </div>
            )}

            {/* Subject */}
            <div className="rounded-xl p-4"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--bg-border)' }}>
              <p className="text-xs font-bold tracking-widest uppercase mb-3"
                style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-display)' }}>
                Subject
              </p>
              <select
                value={studySet.subject_id ?? ''}
                onChange={e => assignSubject(e.target.value || null)}
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={{
                  background: 'var(--bg-base)',
                  border: '1px solid var(--bg-border)',
                  color: 'var(--text-primary)',
                }}>
                <option value="">Uncategorised</option>
                {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            {/* Details */}
            <div className="rounded-xl p-4"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--bg-border)' }}>
              <p className="text-xs font-bold tracking-widest uppercase mb-3"
                style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-display)' }}>
                Details
              </p>
              <dl className="space-y-2 text-sm">
                {[
                  ['Questions',    String(studySet.question_count ?? 0)],
                  ['Documents',    String(studySet.documents.length)],
                  ['Created',      fmt(studySet.created_at)],
                  ['Last studied', studySet.last_studied_at ? fmt(studySet.last_studied_at) : 'Never'],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2">
                    <dt style={{ color: 'var(--text-muted)' }}>{k}</dt>
                    <dd className="font-semibold text-right tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Danger zone */}
            <div className="rounded-xl p-4"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--error)33' }}>
              <p className="text-xs font-bold tracking-widest uppercase mb-3"
                style={{ color: 'var(--error)', fontFamily: 'var(--font-display)' }}>
                Danger Zone
              </p>
              {!confirmDelete ? (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="w-full py-2 rounded-lg text-sm font-semibold border transition-opacity hover:opacity-70"
                  style={{ color: 'var(--error)', borderColor: 'var(--error)55' }}>
                  Delete Study Set
                </button>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
                    Permanently deletes all questions, documents, and history. This cannot be undone.
                  </p>
                  <button onClick={deleteStudySet} disabled={deleting}
                    className="w-full py-2 rounded-lg text-sm font-bold"
                    style={{ background: 'var(--error)', color: '#fff' }}>
                    {deleting ? 'Deleting…' : 'Yes, delete everything'}
                  </button>
                  <button onClick={() => setConfirmDelete(false)}
                    className="w-full py-2 rounded-lg text-sm border"
                    style={{ color: 'var(--text-muted)', borderColor: 'var(--bg-border)' }}>
                    Cancel
                  </button>
                </div>
              )}
            </div>

          </aside>
        </div>
      </div>
    </main>
  )
}
