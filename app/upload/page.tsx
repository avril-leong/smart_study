'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { DropZone } from '@/components/upload/DropZone'
import { SubjectSelector } from '@/components/upload/SubjectSelector'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { Input } from '@/components/ui/Input'
import { createClient } from '@/lib/supabase/client'
import type { Subject } from '@/types'

type Stage = 'idle' | 'uploading' | 'generating' | 'done' | 'error'

export default function UploadPage() {
  const router = useRouter()
  const [files, setFiles] = useState<File[]>([])
  const [name, setName] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [stage, setStage] = useState<Stage>('idle')
  const [error, setError] = useState('')
  const [questionCount, setQuestionCount] = useState(0)
  const [customPrompt, setCustomPrompt] = useState('')
  const [globalCustomPrompt, setGlobalCustomPrompt] = useState('')
  const [hasKey, setHasKey] = useState(false)
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => { if (pollIntervalRef.current) clearInterval(pollIntervalRef.current) }
  }, [])

  useEffect(() => {
    createClient().from('subjects').select('*').order('name')
      .then(({ data }) => { if (data) setSubjects(data) })
    window.fetch('/api/settings/ai')
      .then(r => r.json())
      .then(d => {
        const g = d.globalCustomPrompt ?? ''
        setGlobalCustomPrompt(g)
        setCustomPrompt(g)
        setHasKey(d.hasKey ?? false)
      })
  }, [])

  function addFiles(incoming: File[]) {
    setFiles(prev => {
      const existing = new Set(prev.map(f => f.name + f.size))
      const newOnes = incoming.filter(f => !existing.has(f.name + f.size))
      if (prev.length === 0 && newOnes.length > 0 && !name) {
        setName(newOnes[0].name.replace(/\.[^/.]+$/, ''))
      }
      return [...prev, ...newOnes]
    })
  }

  function removeFile(index: number) {
    setFiles(prev => prev.filter((_, i) => i !== index))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (files.length === 0) return
    if (!hasKey) {
      setError('No API key configured. Go to Settings → AI Settings to add your key before generating questions.')
      return
    }
    setError('')
    setStage('uploading')

    // Upload first file — creates the study set
    const fd0 = new FormData()
    fd0.append('file', files[0])
    fd0.append('name', name)
    if (subjectId) fd0.append('subjectId', subjectId)
    if (customPrompt.trim()) fd0.append('customPrompt', customPrompt.trim())

    const firstRes = await window.fetch('/api/upload', { method: 'POST', body: fd0 })
    if (!firstRes.ok) {
      const text = await firstRes.text()
      let msg = 'Upload failed'
      try { msg = JSON.parse(text).error ?? msg } catch {}
      setError(msg)
      setStage('error')
      return
    }
    const { studySetId } = await firstRes.json()

    // Upload remaining files — attach to existing study set
    for (let i = 1; i < files.length; i++) {
      const fd = new FormData()
      fd.append('file', files[i])
      fd.append('studySetId', studySetId)
      const res = await window.fetch('/api/upload', { method: 'POST', body: fd })
      if (!res.ok) {
        const text = await res.text()
        let msg = `Upload failed for ${files[i].name}`
        try { msg = JSON.parse(text).error ?? msg } catch {}
        setError(msg + '. You can add this file later from the dashboard.')
        setStage('error')
        return
      }
    }

    // Start generating
    setStage('generating')
    pollIntervalRef.current = setInterval(async () => {
      const r = await window.fetch(`/api/generate/status/${studySetId}`)
      const { questionCount: qc } = await r.json()
      setQuestionCount(qc)
    }, 3000)

    const genRes = await window.fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studySetId, mode: 'regenerate' }),
    })

    clearInterval(pollIntervalRef.current ?? undefined)

    if (!genRes.ok) {
      const text = await genRes.text()
      let msg = 'Generation failed'
      try { msg = JSON.parse(text).error ?? msg } catch {}
      setError(msg)
      setStage('error')
      return
    }

    setStage('done')
    setTimeout(() => router.push('/dashboard'), 1500)
  }

  return (
    <main className="min-h-screen p-6 max-w-xl mx-auto">
      <h1 className="font-display text-3xl font-bold mb-8">New Study Set</h1>

      {stage === 'generating' && (
        <div className="text-center py-16">
          <Spinner size={40} />
          <p className="mt-4 font-display font-semibold text-lg">Generating your questions…</p>
          {questionCount > 0 && (
            <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
              {questionCount} questions created so far
            </p>
          )}
          <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
            This usually takes 1–3 minutes
          </p>
          <button
            onClick={() => router.push('/dashboard')}
            className="mt-6 text-sm underline"
            style={{ color: 'var(--text-muted)' }}>
            Leave &mdash; I&apos;ll check later
          </button>
        </div>
      )}

      {stage === 'done' && (
        <div className="text-center py-16">
          <p className="font-display text-2xl font-bold" style={{ color: 'var(--success)' }}>Done!</p>
          <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>Redirecting to dashboard…</p>
        </div>
      )}

      {(stage === 'idle' || stage === 'uploading' || stage === 'error') && (
        <form onSubmit={handleSubmit} className="space-y-6">
          <DropZone multiple onFiles={addFiles} disabled={stage === 'uploading'} />

          {/* File chip list */}
          {files.length > 0 && (
            <ul className="space-y-1">
              {files.map((f, i) => (
                <li key={f.name + f.size} className="flex items-center justify-between text-sm rounded-lg px-3 py-2"
                  style={{ background: 'var(--bg-surface)', border: '1px solid var(--bg-border)' }}>
                  <span>{f.name} <span style={{ color: 'var(--text-muted)' }}>({(f.size / 1024).toFixed(0)} KB)</span></span>
                  <button type="button"
                    onClick={() => removeFile(i)}
                    disabled={stage === 'uploading'}
                    className="ml-3 text-xs"
                    style={{ color: 'var(--error)', opacity: stage === 'uploading' ? 0.4 : 1 }}>
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}

          {files.length > 0 && (
            <>
              <div>
                <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>
                  Study Set Name
                </label>
                <Input value={name} onChange={e => setName(e.target.value)}
                  placeholder="e.g. Chapter 4 Notes" required />
              </div>
              <SubjectSelector subjects={subjects} value={subjectId} onChange={setSubjectId} />
              <div>
                <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>
                  Custom instructions <span className="font-normal">(optional)</span>
                </label>
                <textarea
                  value={customPrompt}
                  onChange={e => setCustomPrompt(e.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder={globalCustomPrompt || "e.g. 'Focus on key dates and figures', 'Generate harder application questions'"}
                  disabled={stage === 'uploading'}
                  className="w-full rounded-lg px-3 py-2 text-sm resize-y"
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--bg-border)',
                    color: 'var(--text-primary)',
                    fontFamily: 'inherit',
                    opacity: stage === 'uploading' ? 0.5 : 1,
                  }}
                />
                <span className="block text-xs mt-1 text-right" style={{ color: 'var(--text-muted)' }}>
                  {customPrompt.length} / 500
                </span>
              </div>
              {error && <p className="text-sm" style={{ color: 'var(--error)' }}>{error}</p>}
              <Button type="submit"
                disabled={stage === 'uploading' || files.length === 0 || !name.trim()}
                className="w-full">
                {stage === 'uploading' ? 'Uploading…' : 'Upload & Generate Questions'}
              </Button>
            </>
          )}
        </form>
      )}
    </main>
  )
}
