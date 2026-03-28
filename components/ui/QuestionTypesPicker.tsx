'use client'
import type { QuestionType } from '@/types'

const OPTIONS: { type: QuestionType; label: string; description: string }[] = [
  { type: 'mcq',          label: 'Multiple Choice',  description: 'Pick one correct answer from four options' },
  { type: 'short_answer', label: 'Short Answer',     description: 'Type a brief phrase (1–5 words)' },
  { type: 'multi_select', label: 'Multi-select',     description: 'Select all correct answers from four options' },
]

interface Props {
  value: QuestionType[]
  onChange: (types: QuestionType[]) => void
  disabled?: boolean
}

export function QuestionTypesPicker({ value, onChange, disabled }: Props) {
  function toggle(type: QuestionType) {
    if (value.includes(type)) {
      // No-op: prevent unchecking the last selected type
      if (value.length === 1) return
      onChange(value.filter(t => t !== type))
    } else {
      onChange([...value, type])
    }
  }

  return (
    <div className="space-y-2" role="group" aria-label="Question types">
      {OPTIONS.map(opt => {
        const checked = value.includes(opt.type)
        const isLast = checked && value.length === 1
        return (
          <label
            key={opt.type}
            className="flex items-start gap-3 rounded-lg px-3 py-2.5 cursor-pointer transition-colors"
            style={{
              background: checked ? 'color-mix(in srgb, var(--accent-cyan) 10%, transparent)' : 'var(--bg-base)',
              border: `1px solid ${checked ? 'var(--accent-cyan)' : 'var(--bg-border)'}`,
              opacity: disabled ? 0.5 : 1,
              cursor: disabled || isLast ? 'not-allowed' : 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => toggle(opt.type)}
              disabled={disabled || isLast}
              className="mt-0.5 accent-[var(--accent-cyan)] shrink-0"
              aria-label={opt.label}
            />
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{opt.label}</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{opt.description}</p>
            </div>
          </label>
        )
      })}
    </div>
  )
}
