'use client'
import { useRef, useState } from 'react'

interface Props {
  onFiles: (files: File[]) => void
  disabled?: boolean
  multiple?: boolean
}

const LABELS: Record<string, string> = {
  'application/pdf': 'PDF', 'text/plain': 'TXT', 'text/markdown': 'MD',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PPTX',
}

// Kept in sync with lib/parsers/index.ts PARSERS map (server-only)
const SUPPORTED_TYPES = Object.keys(LABELS)

export function DropZone({ onFiles, disabled, multiple = false }: Props) {
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function validate(file: File): boolean {
    if (!SUPPORTED_TYPES.includes(file.type)) {
      setError(`Unsupported file type. Accepted: ${Object.values(LABELS).join(', ')}`)
      return false
    }
    if (file.size > 50 * 1024 * 1024) { setError('File too large (max 50MB)'); return false }
    return true
  }

  function handleFiles(incoming: File[]) {
    const valid = incoming.filter(validate)
    if (valid.length > 0) { setError(''); onFiles(valid) }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false)
    handleFiles(Array.from(e.dataTransfer.files))
  }

  return (
    <div>
      <div onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)} onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className="border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-colors"
        style={{ borderColor: dragging ? 'var(--accent-cyan)' : 'var(--bg-border)',
                 background: dragging ? 'var(--accent-cyan)11' : 'transparent' }}>
        <p className="font-display text-lg font-semibold mb-2">
          {multiple ? 'Drop your files here' : 'Drop your file here'}
        </p>
        <p className="text-sm mb-1" style={{ color: 'var(--text-muted)' }}>or click to browse</p>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {Object.values(LABELS).join(' · ')} · Max 50MB
        </p>
        <input ref={inputRef} type="file" className="hidden" disabled={disabled}
          multiple={multiple}
          accept={SUPPORTED_TYPES.join(',')}
          onChange={e => {
            const files = Array.from(e.target.files ?? [])
            if (files.length > 0) handleFiles(files)
            e.target.value = ''
          }} />
      </div>
      {error && <p className="mt-2 text-sm" style={{ color: 'var(--error)' }}>{error}</p>}
    </div>
  )
}
