'use client'
import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) { setError(error.message); setLoading(false) }
    else setDone(true)
  }

  if (done) return (
    <main className="min-h-screen flex items-center justify-center"
      style={{ background: 'radial-gradient(ellipse at 50% 0%, #0d1f3c 0%, var(--bg-base) 70%)' }}>
      <div className="w-full max-w-sm p-8 rounded-2xl border text-center"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--bg-border)' }}>
        <h2 className="font-display text-xl font-bold mb-2">Check your email</h2>
        <p style={{ color: 'var(--text-muted)' }}>We sent a confirmation link to <strong>{email}</strong>.</p>
        <Link href="/login" className="block mt-6 text-sm" style={{ color: 'var(--accent-cyan)' }}>
          Back to login
        </Link>
      </div>
    </main>
  )

  return (
    <main className="min-h-screen flex items-center justify-center"
      style={{ background: 'radial-gradient(ellipse at 50% 0%, #0d1f3c 0%, var(--bg-base) 70%)' }}>
      <div className="w-full max-w-sm p-8 rounded-2xl border"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--bg-border)' }}>
        <h1 className="font-display text-3xl font-bold mb-2" style={{ color: 'var(--accent-cyan)' }}>
          SmartStudy
        </h1>
        <p className="text-sm mb-8" style={{ color: 'var(--text-muted)' }}>Create your account</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
            placeholder="Email" className="w-full px-4 py-3 rounded-lg text-sm outline-none"
            style={{ background: 'var(--bg-base)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)' }} />
          <input type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)}
            placeholder="Password (min 6 chars)" className="w-full px-4 py-3 rounded-lg text-sm outline-none"
            style={{ background: 'var(--bg-base)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)' }} />
          {error && <p className="text-sm" style={{ color: 'var(--error)' }}>{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full py-3 rounded-lg font-display font-semibold text-sm disabled:opacity-50"
            style={{ background: 'var(--accent-cyan)', color: 'var(--bg-base)' }}>
            {loading ? 'Creating account…' : 'Create Account'}
          </button>
        </form>
        <p className="text-center text-sm mt-6" style={{ color: 'var(--text-muted)' }}>
          Have an account? <Link href="/login" style={{ color: 'var(--accent-cyan)' }}>Sign in</Link>
        </p>
      </div>
    </main>
  )
}
