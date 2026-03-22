// components/dashboard/AddDocumentModal.tsx
'use client'
import { useState, useEffect } from 'react'
import { DropZone } from '@/components/upload/DropZone'
import { Button } from '@/components/ui/Button'
import type { StudySet, StudySetDocument, GenerationStatus } from '@/types'

interface Props {
  studySet: StudySet
  onClose: () => void
  onStatusChange: (id: string, status: GenerationStatus) => void
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function AddDocumentModal({ studySet, onClose, onStatusChange }: Props) {
  const [docs, setDocs] = useState<StudySetDocument[]>(studySet.documents)
  const [removingId, setRemovingId] = useState<string | null>(null)
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

  async function removeDoc(docId: string) {
    setRemovingId(docId)
    setError('')
    const res = await window.fetch(`/api/study-sets/${studySet.id}/documents/${docId}`, { method: 'DELETE' })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? 'Failed to remove document')
    } else {
      setDocs(prev => prev.filter(d => d.id !== docId))
    }
    setRemovingId(null)
  }

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

      // Step A: sign
      const signRes = await window.fetch('/api/upload/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileType: file.type, fileSize: file.size, studySetId: studySet.id }),
      })
      if (!signRes.ok) {
        const text = await signRes.text()
        let msg = 'Upload failed for ' + file.name
        try { msg = JSON.parse(text).error ?? msg } catch {}
        setError(msg + '. Fix and try again.')
        setUploading(false)
        return
      }
      const sign = await signRes.json()

      // Step B: direct upload to Supabase Storage
      const putRes = await window.fetch(sign.signedUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      })
      if (!putRes.ok) {
        setError(`Storage upload failed for ${file.name}. Fix and try again.`)
        setUploading(false)
        return
      }

      // Step C: process
      const procRes = await window.fetch('/api/upload/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawStoragePath: sign.rawStoragePath,
          fileName: file.name,
          fileType: file.type,
          studySetId: studySet.id,
          documentId: sign.documentId,
          isNewStudySet: false,
        }),
      })
      if (!procRes.ok) {
        const text = await procRes.text()
        let msg = 'Upload failed for ' + file.name
        try { msg = JSON.parse(text).error ?? msg } catch {}
        setError(msg + '. Fix and try again.')
        setUploading(false)
        return
      }
      const { documentId } = await procRes.json()
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
        {docs.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>
              EXISTING DOCUMENTS
            </p>
            <ul className="space-y-1">
              {docs.map(doc => (
                <li key={doc.id} className="flex items-center justify-between text-sm gap-2">
                  <span className="truncate flex-1">{doc.file_name}</span>
                  <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                    {formatDate(doc.uploaded_at)}
                  </span>
                  <button
                    onClick={() => removeDoc(doc.id)}
                    disabled={!!removingId || uploading}
                    className="text-xs flex-shrink-0 ml-1"
                    style={{ color: 'var(--error)', opacity: (removingId || uploading) ? 0.4 : 1 }}>
                    {removingId === doc.id ? '…' : 'Remove'}
                  </button>
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
