'use client'
import { useRef, useState } from 'react'
import { SUPPORTED_TYPES } from '@/lib/parsers/index'

interface Props { onFile: (file: File) => void; disabled?: boolean }

const LABELS: Record<string, string> = {
  'application/pdf': 'PDF', 'text/plain': 'TXT', 'text/markdown': 'MD',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PPTX',
}

export function DropZone({ onFile, disabled }: Props) {
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function validate(file: File) {
    if (!SUPPORTED_TYPES.includes(file.type)) {
      setError(`Unsupported file type. Accepted: ${Object.values(LABELS).join(', ')}`)
      return false
    }
    if (file.size > 50 * 1024 * 1024) { setError('File too large (max 50MB)'); return false }
    setError('')
    return true
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file && validate(file)) onFile(file)
  }

  return (
    <div>
      <div onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)} onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className="border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-colors"
        style={{ borderColor: dragging ? 'var(--accent-cyan)' : 'var(--bg-border)',
                 background: dragging ? 'var(--accent-cyan)11' : 'transparent' }}>
        <p className="font-display text-lg font-semibold mb-2">Drop your file here</p>
        <p className="text-sm mb-1" style={{ color: 'var(--text-muted)' }}>or click to browse</p>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {Object.values(LABELS).join(' · ')} · Max 50MB
        </p>
        <input ref={inputRef} type="file" className="hidden" disabled={disabled}
          accept={SUPPORTED_TYPES.join(',')}
          onChange={e => { const f = e.target.files?.[0]; if (f && validate(f)) onFile(f); e.target.value = '' }} />
      </div>
      {error && <p className="mt-2 text-sm" style={{ color: 'var(--error)' }}>{error}</p>}
    </div>
  )
}
