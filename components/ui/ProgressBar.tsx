export function ProgressBar({ value, max }: { value: number; max: number }) {
  const scale = max > 0 ? value / max : 0
  return (
    <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-border)' }}>
      <div
        className="h-full w-full rounded-full"
        style={{
          background: 'var(--accent-cyan)',
          transform: `scaleX(${scale})`,
          transformOrigin: 'left',
          transition: 'transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
          willChange: 'transform',
        }}
      />
    </div>
  )
}
