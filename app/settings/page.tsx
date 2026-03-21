'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import type { Subject } from '@/types'

export default function SettingsPage() {
  const router = useRouter()
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#00c9ff')
  const [deleteTarget, setDeleteTarget] = useState<Subject | null>(null)

  async function load() {
    const { data } = await createClient().from('subjects').select('*').order('name')
    if (data) setSubjects(data)
  }

  useEffect(() => { load() }, [])

  async function createSubject(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    await createClient().from('subjects').insert({ name: newName.trim(), color: newColor })
    setNewName(''); setNewColor('#00c9ff'); load()
  }

  async function deleteSubject(id: string) {
    await createClient().from('subjects').delete().eq('id', id)
    setDeleteTarget(null); load()
  }

  async function signOut() {
    await createClient().auth.signOut()
    router.push('/login')
  }

  return (
    <main className="min-h-screen p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <h1 className="font-display text-3xl font-bold">Settings</h1>
        <Button variant="ghost" onClick={() => router.back()}>← Back</Button>
      </div>

      <section className="mb-10">
        <h2 className="font-display font-bold text-xl mb-4">Subjects</h2>
        <form onSubmit={createSubject} className="flex gap-3 mb-6">
          <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="New subject name" />
          <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)}
            className="w-12 h-12 rounded-lg cursor-pointer border-0 p-1"
            style={{ background: 'var(--bg-surface)' }} />
          <Button type="submit">Add</Button>
        </form>
        <div className="space-y-3">
          {subjects.map(s => (
            <div key={s.id + '-' + s.name} className="flex items-center gap-3 p-4 rounded-xl border"
              style={{ background: 'var(--bg-surface)', borderColor: 'var(--bg-border)' }}>
              <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ background: s.color }} />
              <input defaultValue={s.name}
                className="flex-1 font-semibold bg-transparent outline-none border-b border-transparent focus:border-current"
                style={{ color: 'var(--text-primary)' }}
                onBlur={async (e) => {
                  const updatedName = e.target.value.trim()
                  if (updatedName && updatedName !== s.name) {
                    await createClient().from('subjects').update({ name: updatedName }).eq('id', s.id)
                    load()
                  }
                }}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
              />
              <button onClick={() => setDeleteTarget(s)} className="text-sm"
                style={{ color: 'var(--error)' }}>Delete</button>
            </div>
          ))}
          {subjects.length === 0 && (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No subjects yet.</p>
          )}
        </div>
      </section>

      <section>
        <h2 className="font-display font-bold text-xl mb-4">Account</h2>
        <Button variant="danger" onClick={signOut}>Sign Out</Button>
      </section>

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Subject">
        <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
          Delete <strong>{deleteTarget?.name}</strong>? Study sets will be moved to Uncategorised.
        </p>
        <div className="flex gap-3">
          <Button variant="danger" onClick={() => deleteTarget && deleteSubject(deleteTarget.id)}>Delete</Button>
          <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
        </div>
      </Modal>
    </main>
  )
}
