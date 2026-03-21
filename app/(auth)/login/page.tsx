'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false) }
    else router.push('/dashboard')
  }

  return (
    <main className="min-h-screen flex items-center justify-center"
      style={{ background: 'radial-gradient(ellipse at 50% 0%, #0d1f3c 0%, var(--bg-base) 70%)' }}>
      <div className="w-full max-w-sm p-8 rounded-2xl border"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--bg-border)' }}>
        <h1 className="font-display text-3xl font-bold mb-2" style={{ color: 'var(--accent-cyan)' }}>
          SmartStudy
        </h1>
        <p className="text-sm mb-8" style={{ color: 'var(--text-muted)' }}>Sign in to your account</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email" required value={email} onChange={e => setEmail(e.target.value)}
            placeholder="Email" className="w-full px-4 py-3 rounded-lg text-sm outline-none"
            style={{ background: 'var(--bg-base)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)' }}
          />
          <input
            type="password" required value={password} onChange={e => setPassword(e.target.value)}
            placeholder="Password" className="w-full px-4 py-3 rounded-lg text-sm outline-none"
            style={{ background: 'var(--bg-base)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)' }}
          />
          {error && <p className="text-sm" style={{ color: 'var(--error)' }}>{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full py-3 rounded-lg font-display font-semibold text-sm transition-opacity disabled:opacity-50"
            style={{ background: 'var(--accent-cyan)', color: 'var(--bg-base)' }}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
        <p className="text-center text-sm mt-6" style={{ color: 'var(--text-muted)' }}>
          No account?{' '}
          <Link href="/register" style={{ color: 'var(--accent-cyan)' }}>Register</Link>
        </p>
      </div>
    </main>
  )
}
