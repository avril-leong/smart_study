export function Card({ className = '', children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`rounded-2xl border p-6 ${className}`}
      style={{ background: 'var(--bg-surface)', borderColor: 'var(--bg-border)' }}
      {...props}>
      {children}
    </div>
  )
}
