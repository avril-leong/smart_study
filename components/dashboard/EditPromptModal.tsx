// components/dashboard/EditPromptModal.tsx
'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import type { StudySet } from '@/types'

interface Props {
  studySet: StudySet
  onClose: () => void
}

export function EditPromptModal({ studySet, onClose }: Props) {
  const [prompt, setPrompt] = useState(studySet.custom_prompt ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setSaving(true)
    setError('')
    const res = await window.fetch(`/api/study-sets/${studySet.id}/prompt`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customPrompt: prompt.trim() || null }),
    })
    if (!res.ok) {
      const d = await res.json()
      setError(d.error ?? 'Save failed')
    } else {
      onClose()
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="rounded-2xl p-6 w-full max-w-lg mx-4"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--bg-border)' }}>
        <h2 className="font-display text-xl font-bold mb-2">Custom Instructions</h2>
        <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
          Override the default instructions for this study set. Only affects future generation runs.
        </p>
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          rows={4}
          maxLength={500}
          placeholder="e.g. Focus on key definitions, generate harder questions"
          className="w-full rounded-lg px-3 py-2 text-sm resize-y mb-1"
          style={{
            background: 'var(--bg-base)',
            border: '1px solid var(--bg-border)',
            color: 'var(--text-primary)',
            fontFamily: 'inherit',
          }}
        />
        <div className="flex justify-between items-center mb-4">
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {prompt.length} / 500
          </span>
          {prompt && (
            <button type="button" onClick={() => setPrompt('')}
              className="text-xs underline" style={{ color: 'var(--text-muted)' }}>
              Clear
            </button>
          )}
        </div>
        {error && <p className="text-sm mb-3" style={{ color: 'var(--error)' }}>{error}</p>}
        <div className="flex gap-3">
          <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  )
}
