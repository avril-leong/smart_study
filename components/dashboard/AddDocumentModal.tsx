// components/dashboard/AddDocumentModal.tsx
'use client'
import { useState } from 'react'
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
  const [uploadedDocIds, setUploadedDocIds] = useState<string[]>([])
  const [mode, setMode] = useState<'append' | 'regenerate'>('append')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

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
    if (pendingFiles.length === 0) return
    setUploading(true)
    setError('')

    const newDocIds: string[] = [...uploadedDocIds]
    const remainingFiles = pendingFiles.slice(uploadedDocIds.length)

    for (const file of remainingFiles) {
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
      newDocIds.push(documentId)
      setUploadedDocIds([...newDocIds])
    }

    // All uploads succeeded — trigger generation
    const body: Record<string, unknown> = { studySetId: studySet.id, mode }
    if (mode === 'append') body.documentIds = newDocIds

    await window.fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

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
              <li key={i} className="flex items-center justify-between text-sm">
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
