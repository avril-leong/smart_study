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
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [stage, setStage] = useState<Stage>('idle')
  const [error, setError] = useState('')
  const [questionCount, setQuestionCount] = useState(0)
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
    }
  }, [])

  useEffect(() => {
    createClient().from('subjects').select('*').order('name')
      .then(({ data }) => { if (data) setSubjects(data) })
  }, [])

  function handleFile(f: File) {
    setFile(f)
    if (!name) setName(f.name.replace(/\.[^/.]+$/, ''))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) return
    setError(''); setStage('uploading')

    const fd = new FormData()
    fd.append('file', file)
    fd.append('name', name)
    if (subjectId) fd.append('subjectId', subjectId)

    const uploadRes = await fetch('/api/upload', { method: 'POST', body: fd })
    if (!uploadRes.ok) {
      const text = await uploadRes.text()
      let msg = 'Upload failed'
      try { msg = JSON.parse(text).error ?? msg } catch {}
      setError(msg); setStage('error'); return
    }
    const { studySetId } = await uploadRes.json()

    setStage('generating')

    pollIntervalRef.current = setInterval(async () => {
      const r = await fetch(`/api/generate/status/${studySetId}`)
      const { questionCount: qc } = await r.json()
      setQuestionCount(qc)
    }, 3000)

    const genRes = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studySetId }),
    })
    clearInterval(pollIntervalRef.current ?? undefined)

    if (!genRes.ok) {
      const text = await genRes.text()
      let msg = 'Generation failed'
      try { msg = JSON.parse(text).error ?? msg } catch {}
      setError(msg); setStage('error'); return
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
            <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>{questionCount} questions so far</p>
          )}
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
          <DropZone onFile={handleFile} disabled={stage === 'uploading'} />
          {file && (
            <>
              <div>
                <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>
                  Study Set Name
                </label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Chapter 4 Notes" required />
              </div>
              <SubjectSelector subjects={subjects} value={subjectId} onChange={setSubjectId} />
              {error && <p className="text-sm" style={{ color: 'var(--error)' }}>{error}</p>}
              <Button type="submit" disabled={stage === 'uploading'} className="w-full">
                {stage === 'uploading' ? 'Uploading…' : 'Upload & Generate Questions'}
              </Button>
            </>
          )}
        </form>
      )}
    </main>
  )
}
