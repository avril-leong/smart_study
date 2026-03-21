export function Spinner({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="animate-spin"
      style={{ color: 'var(--accent-cyan)' }}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"
        fill="none" strokeDasharray="31.4" strokeDashoffset="10" strokeLinecap="round" />
    </svg>
  )
}
