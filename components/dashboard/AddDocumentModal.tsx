// components/dashboard/AddDocumentModal.tsx
'use client'
import { useState, useEffect } from 'react'
import { DropZone } from '@/components/upload/DropZone'
import { Button } from '@/components/ui/Button'
import type { StudySet, GenerationStatus } from '@/types'

interface Props {
  studySet: StudySet
  onClose: () => void
  onStatusChange: (id: string, status: GenerationStatus) => void
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function AddDocumentModal({ studySet, onClose, onStatusChange }: Props) {
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [uploadedKeys, setUploadedKeys] = useState<Record<string, string>>({}) // fileKey -> documentId
  const [mode, setMode] = useState<'append' | 'regenerate'>('append')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [customPrompt, setCustomPrompt] = useState(studySet.custom_prompt ?? '')
  const [globalCustomPrompt, setGlobalCustomPrompt] = useState('')
  const [hasKey, setHasKey] = useState(false)

  useEffect(() => {
    window.fetch('/api/settings/ai')
      .then(r => r.json())
      .then(d => {
        setGlobalCustomPrompt(d.globalCustomPrompt ?? '')
        setHasKey(d.hasKey ?? false)
      })
  }, [])

  function addPending(incoming: File[]) {
    setPendingFiles(prev => {
      const existing = new Set(prev.map(f => f.name + f.size))
      return [...prev, ...incoming.filter(f => !existing.has(f.name + f.size))]
    })
  }

  function removeFile(index: number) {
    if (uploading) return
    setPendingFiles(prev => prev.filter((_, i) => i !== index))
  }

  async function handleConfirm() {
    if (pendingFiles.length === 0 || uploading) return
    if (!hasKey) {
      setError('No API key configured. Go to Settings → AI Settings to add your key before generating questions.')
      return
    }
    setUploading(true)
    setError('')

    const newKeys: Record<string, string> = { ...uploadedKeys }

    for (const file of pendingFiles) {
      const fileKey = file.name + file.size
      if (newKeys[fileKey]) continue  // already uploaded in a previous attempt

      const fd = new FormData()
      fd.append('file', file)
      fd.append('studySetId', studySet.id)

      const res = await window.fetch('/api/upload', { method: 'POST', body: fd })
      if (!res.ok) {
        const text = await res.text()
        let msg = 'Upload failed for ' + file.name
        try { msg = JSON.parse(text).error ?? msg } catch {}
        setError(msg + '. Fix and try again.')
        setUploading(false)
        return
      }
      const { documentId } = await res.json()
      newKeys[fileKey] = documentId
      setUploadedKeys({ ...newKeys })
    }

    // All uploads succeeded — trigger generation
    const allDocIds = Object.values(newKeys)
    const body: Record<string, unknown> = { studySetId: studySet.id, mode, customPrompt: customPrompt.trim() || null }
    if (mode === 'append') body.documentIds = allDocIds

    const genRes = await window.fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!genRes.ok) {
      const text = await genRes.text()
      let msg = 'Generation failed'
      try { msg = JSON.parse(text).error ?? msg } catch {}
      setError(msg)
      setUploading(false)
      return
    }

    onStatusChange(studySet.id, 'processing')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="rounded-2xl p-6 w-full max-w-lg mx-4"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--bg-border)' }}>
        <h2 className="font-display text-xl font-bold mb-4">Add Document</h2>

        {/* Section 1: existing documents */}
        {studySet.documents.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>
              EXISTING DOCUMENTS
            </p>
            <ul className="space-y-1">
              {studySet.documents.map(doc => (
                <li key={doc.id} className="flex items-center justify-between text-sm">
                  <span>{doc.file_name}</span>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {formatDate(doc.uploaded_at)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Section 2: new files */}
        <DropZone multiple onFiles={addPending} disabled={uploading} />

        {pendingFiles.length > 0 && (
          <ul className="mt-3 space-y-1">
            {pendingFiles.map((f, i) => (
              <li key={f.name + f.size} className="flex items-center justify-between text-sm">
                <span>{f.name} ({(f.size / 1024).toFixed(0)} KB)</span>
                <button
                  onClick={() => removeFile(i)}
                  disabled={uploading}
                  className="text-xs ml-2"
                  style={{ color: 'var(--error)', opacity: uploading ? 0.4 : 1 }}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Section 3: mode selector */}
        {pendingFiles.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
              WHAT TO DO WITH QUESTIONS
            </p>
            <label className="flex items-start gap-2 cursor-pointer">
              <input type="radio" name="mode" value="append"
                checked={mode === 'append'} onChange={() => setMode('append')} className="mt-0.5" />
              <span className="text-sm">Add to existing questions</span>
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <input type="radio" name="mode" value="regenerate"
                checked={mode === 'regenerate'} onChange={() => setMode('regenerate')} className="mt-0.5" />
              <span className="text-sm">Delete all questions and regenerate from all documents</span>
            </label>
            <div className="mt-4">
              <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>
                Custom instructions <span className="font-normal">(optional)</span>
              </label>
              <textarea
                value={customPrompt}
                onChange={e => setCustomPrompt(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder={globalCustomPrompt || "e.g. Focus on key concepts"}
                className="w-full rounded-lg px-3 py-2 text-sm resize-y"
                style={{
                  background: 'var(--bg-base)',
                  border: '1px solid var(--bg-border)',
                  color: 'var(--text-primary)',
                  fontFamily: 'inherit',
                }}
              />
              <span className="block text-xs mt-1 text-right" style={{ color: 'var(--text-muted)' }}>
                {customPrompt.length} / 500
              </span>
            </div>
          </div>
        )}

        {error && (
          <p className="mt-3 text-sm" style={{ color: 'var(--error)' }}>{error}</p>
        )}

        <div className="flex gap-3 mt-6 justify-end">
          <Button variant="ghost" onClick={onClose} disabled={uploading}>Cancel</Button>
          <Button onClick={handleConfirm}
            disabled={pendingFiles.length === 0 || uploading}>
            {uploading ? 'Uploading…' : 'Confirm'}
          </Button>
        </div>
      </div>
    </div>
  )
}
