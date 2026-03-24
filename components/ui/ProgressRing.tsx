export function ProgressRing({ value, max, size = 56 }: { value: number; max: number; size?: number }) {
  const r = (size - 8) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (value / max) * circ
  return (
    <svg width={size} height={size} role="img" aria-label={`${max > 0 ? Math.round((value / max) * 100) : 0}% mastery`}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--bg-border)" strokeWidth="4" />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--accent-cyan)" strokeWidth="4"
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round" transform={`rotate(-90 ${size/2} ${size/2})`}
        style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
        style={{ fontSize: size * 0.22, fill: 'var(--text-primary)', fontFamily: 'var(--font-display)', fontWeight: 700 }}>
        {max > 0 ? Math.round((value/max)*100) : 0}%
      </text>
    </svg>
  )
}
