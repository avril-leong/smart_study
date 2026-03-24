interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
}

export function Button({ variant = 'primary', size = 'md', className = '', ...props }: ButtonProps) {
  const base = 'inline-flex items-center justify-center font-display font-semibold rounded-lg transition-all disabled:opacity-50 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-cyan)]'
  const sizes = { sm: 'px-3 py-1.5 text-xs', md: 'px-5 py-2.5 text-sm' }
  const variants = {
    primary: 'hover:opacity-90 active:scale-95',
    ghost: 'border hover:bg-white/5',
    danger: 'hover:opacity-90',
  }
  const styles = {
    primary: { background: 'var(--accent-cyan)', color: 'var(--text-on-accent)' },
    ghost: { borderColor: 'var(--bg-border)', color: 'var(--text-primary)' },
    danger: { background: 'var(--error)', color: 'var(--text-on-accent)' },
  }
  return (
    <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
      style={styles[variant]} {...props} />
  )
}
