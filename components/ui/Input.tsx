export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input className="w-full px-4 py-3 rounded-lg text-sm outline-none transition-colors"
      style={{ background: 'var(--bg-base)', border: '1px solid var(--bg-border)',
               color: 'var(--text-primary)' }}
      onFocus={e => (e.target.style.borderColor = 'var(--accent-cyan)')}
      onBlur={e => (e.target.style.borderColor = 'var(--bg-border)')}
      {...props} />
  )
}
