export function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = Math.round((value / max) * 100)
  return (
    <div className="w-full h-2 rounded-full" style={{ background: 'var(--bg-border)' }}>
      <div className="h-2 rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, background: 'var(--accent-cyan)' }} />
    </div>
  )
}
