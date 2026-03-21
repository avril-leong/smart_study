'use client'
import type { Subject } from '@/types'

interface Props {
  subjects: Subject[]
  value: string
  onChange: (id: string) => void
}

export function SubjectSelector({ subjects, value, onChange }: Props) {
  return (
    <div>
      <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>
        Subject / Module
      </label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full px-4 py-3 rounded-lg text-sm outline-none"
        style={{ background: 'var(--bg-base)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)' }}>
        <option value="">Uncategorised</option>
        {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
    </div>
  )
}
