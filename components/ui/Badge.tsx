// components/ui/Badge.tsx
interface BadgeProps {
  label?: string
  children?: React.ReactNode
  color?: string
}

export function Badge({ label, children, color = 'var(--accent-cyan)' }: BadgeProps) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold"
      style={{ background: color + '22', color }}>
      {label ?? children}
    </span>
  )
}
