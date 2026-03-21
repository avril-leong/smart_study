'use client'
import { useState, useRef, useEffect } from 'react'

interface RenameInputProps { value: string; onSave: (name: string) => void }

export function RenameInput({ value, onSave }: RenameInputProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  function save() {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== value) onSave(trimmed)
    setEditing(false)
  }

  if (!editing) return (
    <span className="font-display font-semibold cursor-pointer hover:underline"
      onClick={() => setEditing(true)}>
      {value}
    </span>
  )
  return (
    <input ref={inputRef} value={draft} onChange={e => setDraft(e.target.value)}
      onBlur={save} onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
      className="font-display font-semibold bg-transparent outline-none border-b"
      style={{ borderColor: 'var(--accent-cyan)', color: 'var(--text-primary)', width: `${draft.length + 2}ch` }} />
  )
}
