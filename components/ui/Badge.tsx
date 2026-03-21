interface BadgeProps { label: string; color?: string }
export function Badge({ label, color = 'var(--accent-cyan)' }: BadgeProps) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold"
      style={{ background: color + '22', color }}>
      {label}
    </span>
  )
}
