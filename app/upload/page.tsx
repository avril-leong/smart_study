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

    let studySetId: string | null = null

    // Upload first file — creates the study set
    const file0 = files[0]

    // Step A: sign
    const signRes0 = await window.fetch('/api/upload/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileType: file0.type,
        fileSize: file0.size,
        name,
        customPrompt: customPrompt.trim() || undefined,
      }),
    })
    if (!signRes0.ok) {
      const text = await signRes0.text()
      let msg = 'Upload failed'
      try { msg = JSON.parse(text).error ?? msg } catch {}
      setError(msg); setStage('error'); return
    }
    const sign0 = await signRes0.json()
    studySetId = sign0.studySetId

    // Step B: direct upload to Supabase Storage
    const putRes0 = await window.fetch(sign0.signedUrl, {
      method: 'PUT',
      body: file0,
      headers: { 'Content-Type': file0.type },
    })
    if (!putRes0.ok) {
      setError('Storage upload failed for ' + file0.name); setStage('error'); return
    }

    // Step C: process
    const procRes0 = await window.fetch('/api/upload/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rawStoragePath: sign0.rawStoragePath,
        fileName: file0.name,
        fileType: file0.type,
        studySetId: sign0.studySetId,
        documentId: sign0.documentId,
        isNewStudySet: true,
        name,
        subjectId: subjectId || null,
        customPrompt: customPrompt.trim() || null,
      }),
    })
    if (!procRes0.ok) {
      const text = await procRes0.text()
      let msg = 'Upload failed for ' + file0.name
      try { msg = JSON.parse(text).error ?? msg } catch {}
      setError(msg); setStage('error'); return
    }

    // Upload remaining files — attach to existing study set
    for (let i = 1; i < files.length; i++) {
      const file = files[i]

      const signRes = await window.fetch('/api/upload/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileType: file.type, fileSize: file.size, studySetId }),
      })
      if (!signRes.ok) {
        const text = await signRes.text()
        let msg = `Upload failed for ${file.name}`
        try { msg = JSON.parse(text).error ?? msg } catch {}
        setError(msg + '. You can add this file later from the dashboard.'); setStage('error'); return
      }
      const sign = await signRes.json()

      const putRes = await window.fetch(sign.signedUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      })
      if (!putRes.ok) {
        setError(`Storage upload failed for ${file.name}. You can add this file later from the dashboard.`)
        setStage('error'); return
      }

      const procRes = await window.fetch('/api/upload/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawStoragePath: sign.rawStoragePath,
          fileName: file.name,
          fileType: file.type,
          studySetId,
          documentId: sign.documentId,
          isNewStudySet: false,
        }),
      })
      if (!procRes.ok) {
        const text = await procRes.text()
        let msg = `Upload failed for ${file.name}`
        try { msg = JSON.parse(text).error ?? msg } catch {}
        setError(msg + '. You can add this file later from the dashboard.'); setStage('error'); return
      }
    }

    // Start generating
    setStage('generating')
    pollIntervalRef.current = setInterval(async () => {
      const r = await window.fetch(`/api/generate/status/${studySetId}`)
      const { questionCount: qc } = await r.json()
      setQuestionCount(qc)
    }, 3000)

    try {
      const genRes = await window.fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studySetId, mode: 'regenerate' }),
      })

      if (!genRes.ok) {
        const text = await genRes.text()
        let msg = 'Generation failed'
        try { msg = JSON.parse(text).error ?? msg } catch {}
        setError(msg); setStage('error'); return
      }

      setStage('done')
      setTimeout(() => router.push('/dashboard'), 1500)
    } finally {
      clearInterval(pollIntervalRef.current ?? undefined)
    }
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
