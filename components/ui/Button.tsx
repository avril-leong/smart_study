interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
}

export function Button({ variant = 'primary', size = 'md', className = '', ...props }: ButtonProps) {
  const base = 'inline-flex items-center justify-center font-display font-semibold rounded-lg transition-all disabled:opacity-50 cursor-pointer'
  const sizes = { sm: 'px-3 py-1.5 text-xs', md: 'px-5 py-2.5 text-sm' }
  const variants = {
    primary: 'hover:opacity-90 active:scale-95',
    ghost: 'border hover:bg-white/5',
    danger: 'hover:opacity-90',
  }
  const styles = {
    primary: { background: 'var(--accent-cyan)', color: 'var(--bg-base)' },
    ghost: { borderColor: 'var(--bg-border)', color: 'var(--text-primary)' },
    danger: { background: 'var(--error)', color: '#fff' },
  }
  return (
    <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
      style={styles[variant]} {...props} />
  )
}
