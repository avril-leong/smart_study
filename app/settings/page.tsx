'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import type { Subject, AIProvider } from '@/types'
import { DEFAULT_BASE_PROMPT } from '@/lib/ai/constants'

export default function SettingsPage() {
  const router = useRouter()
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#00c9ff')
  const [deleteTarget, setDeleteTarget] = useState<Subject | null>(null)

  const [aiProvider, setAiProvider] = useState<AIProvider>('deepseek')
  const [aiModel, setAiModel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [hasKey, setHasKey] = useState(false)
  const [basePrompt, setBasePrompt] = useState(DEFAULT_BASE_PROMPT)
  const [globalCustomPrompt, setGlobalCustomPrompt] = useState('')
  const [aiSaving, setAiSaving] = useState(false)
  const [aiSaveMsg, setAiSaveMsg] = useState('')
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle')
  const [testError, setTestError] = useState('')
  const [guideOpen, setGuideOpen] = useState(false)

  async function load() {
    const { data } = await createClient().from('subjects').select('*').order('name')
    if (data) setSubjects(data)
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    window.fetch('/api/settings/ai')
      .then(r => r.json())
      .then(d => {
        setAiProvider(d.provider ?? 'deepseek')
        setAiModel(d.model ?? '')
        setHasKey(d.hasKey ?? false)
        setBasePrompt(d.basePrompt ?? DEFAULT_BASE_PROMPT)
        setGlobalCustomPrompt(d.globalCustomPrompt ?? '')
      })
  }, [])

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

  async function testKey() {
    setTestStatus('testing')
    setTestError('')
    const res = await window.fetch('/api/settings/ai/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: aiProvider, model: aiModel, apiKey }),
    })
    if (res.ok) {
      setTestStatus('ok')
    } else {
      const d = await res.json()
      setTestStatus('error')
      setTestError(d.error ?? 'Key invalid')
    }
  }

  async function saveAISettings(e: React.FormEvent) {
    e.preventDefault()
    setAiSaving(true)
    setAiSaveMsg('')
    const body: Record<string, string | null> = {
      provider: aiProvider,
      model: aiModel,
      globalCustomPrompt: globalCustomPrompt.trim() || null,
      basePrompt: basePrompt.trim() || null,
    }
    if (apiKey.trim()) body.apiKey = apiKey.trim()
    const res = await window.fetch('/api/settings/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const d = await res.json()
    setAiSaveMsg(res.ok ? 'Saved!' : (d.error ?? 'Save failed'))
    setAiSaving(false)
    if (res.ok) setApiKey('')
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

      <section className="mb-10">
        <h2 className="font-display font-bold text-xl mb-1">AI Settings</h2>
        <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
          Add your own API key to generate questions. Supports OpenAI, DeepSeek, and OpenRouter.
        </p>

        <form onSubmit={saveAISettings} className="space-y-8">

          {/* ── Provider & Key ── */}
          <div className="rounded-xl border p-5 space-y-4"
            style={{ background: 'var(--bg-surface)', borderColor: 'var(--bg-border)' }}>
            <h3 className="font-semibold">AI Provider</h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>
                  Provider
                </label>
                <select
                  value={aiProvider}
                  onChange={e => { setAiProvider(e.target.value as AIProvider); setTestStatus('idle') }}
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ background: 'var(--bg-base)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)' }}>
                  <option value="deepseek">DeepSeek</option>
                  <option value="openai">OpenAI</option>
                  <option value="openrouter">OpenRouter</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>
                  Model <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                    (leave blank for default)
                  </span>
                </label>
                <Input
                  value={aiModel}
                  onChange={e => setAiModel(e.target.value)}
                  placeholder={
                    aiProvider === 'openai' ? 'gpt-4o-mini' :
                    aiProvider === 'openrouter' ? 'openai/gpt-4o-mini' :
                    'deepseek-chat'
                  }
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>
                API Key {hasKey && !apiKey && <span style={{ color: 'var(--success, #22c55e)' }}>✓ Saved</span>}
              </label>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={apiKey}
                  onChange={e => { setApiKey(e.target.value); setTestStatus('idle') }}
                  placeholder={hasKey ? '••••••••  (enter new key to replace)' : 'Paste your API key'}
                  className="flex-1 rounded-lg px-3 py-2 text-sm"
                  style={{ background: 'var(--bg-base)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)' }}
                />
                {apiKey.trim() && (
                  <button
                    type="button"
                    onClick={testKey}
                    disabled={testStatus === 'testing'}
                    className="px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap"
                    style={{ background: 'var(--bg-base)', border: '1px solid var(--bg-border)', color: 'var(--text-muted)' }}>
                    {testStatus === 'testing' ? 'Testing…' : testStatus === 'ok' ? '✓ Valid' : 'Test key'}
                  </button>
                )}
              </div>
              {testStatus === 'error' && (
                <p className="text-xs mt-1" style={{ color: 'var(--error)' }}>{testError}</p>
              )}
              <p className="text-xs mt-2 flex items-center gap-1" style={{ color: 'var(--text-muted)', opacity: 0.7 }}>
                <span>🔒</span>
                Your key is encrypted at rest and only used to generate your questions. We never store it in plain text.
              </p>
            </div>

            {/* Provider guide */}
            <div>
              <button
                type="button"
                onClick={() => setGuideOpen(o => !o)}
                className="text-xs underline"
                style={{ color: 'var(--text-muted)' }}>
                {guideOpen ? 'Hide guide' : 'How do I get an API key?'}
              </button>
              {guideOpen && (
                <div className="mt-3 rounded-lg p-4 text-xs space-y-1"
                  style={{ background: 'var(--bg-base)', border: '1px solid var(--bg-border)', color: 'var(--text-muted)' }}>
                  {aiProvider === 'openai' && <>
                    <p><strong style={{ color: 'var(--text-primary)' }}>OpenAI</strong></p>
                    <p>1. Create an account at <strong>platform.openai.com</strong></p>
                    <p>2. Go to <strong>API keys</strong> in your dashboard and click <em>Create new secret key</em></p>
                    <p>3. Recommended model: <code>gpt-4o-mini</code> (fast and affordable)</p>
                    <p>4. Add credits under Billing — usage is pay-per-token</p>
                  </>}
                  {aiProvider === 'deepseek' && <>
                    <p><strong style={{ color: 'var(--text-primary)' }}>DeepSeek</strong></p>
                    <p>1. Create an account at <strong>platform.deepseek.com</strong></p>
                    <p>2. Go to <strong>API Keys</strong> and click <em>Create new API key</em></p>
                    <p>3. Recommended model: <code>deepseek-chat</code> (very cost-effective)</p>
                    <p>4. Add credits under Top Up</p>
                  </>}
                  {aiProvider === 'openrouter' && <>
                    <p><strong style={{ color: 'var(--text-primary)' }}>OpenRouter</strong></p>
                    <p>1. Create an account at <strong>openrouter.ai</strong></p>
                    <p>2. Go to <strong>Keys</strong> and create a new key</p>
                    <p>3. Recommended model: <code>openai/gpt-4o-mini</code> or explore cheaper options</p>
                    <p>4. OpenRouter aggregates many providers — you can switch models easily</p>
                  </>}
                </div>
              )}
            </div>
          </div>

          {/* ── Base Prompt ── */}
          <div className="rounded-xl border p-5 space-y-3"
            style={{ background: 'var(--bg-surface)', borderColor: 'var(--bg-border)' }}>
            <div>
              <h3 className="font-semibold">Question Generation Style</h3>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                Write in plain English — this controls how the AI crafts your questions: style, difficulty, question type mix.
                The JSON format is handled automatically. You can reset to the recommended default at any time.
              </p>
            </div>
            <textarea
              value={basePrompt}
              onChange={e => setBasePrompt(e.target.value)}
              rows={4}
              maxLength={1000}
              className="w-full rounded-lg px-3 py-2 text-sm resize-y"
              style={{
                background: 'var(--bg-base)',
                border: '1px solid var(--bg-border)',
                color: 'var(--text-primary)',
                fontFamily: 'inherit',
              }}
            />
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {basePrompt.length} / 1000
              </span>
              <button
                type="button"
                onClick={() => setBasePrompt(DEFAULT_BASE_PROMPT)}
                className="text-xs underline"
                style={{ color: 'var(--text-muted)' }}>
                Reset to default
              </button>
            </div>
          </div>

          {/* ── Global Custom Instructions ── */}
          <div className="rounded-xl border p-5 space-y-3"
            style={{ background: 'var(--bg-surface)', borderColor: 'var(--bg-border)' }}>
            <div>
              <h3 className="font-semibold">Default Custom Instructions <span className="font-normal text-sm" style={{ color: 'var(--text-muted)' }}>(optional)</span></h3>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                Extra context added to every study set unless the set has its own instructions.
                Example: <em>&quot;Focus on definitions and key terms&quot;</em> or <em>&quot;Generate harder application-level questions&quot;</em>.
              </p>
            </div>
            <textarea
              value={globalCustomPrompt}
              onChange={e => setGlobalCustomPrompt(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="e.g. Focus on key dates and figures"
              className="w-full rounded-lg px-3 py-2 text-sm resize-y"
              style={{
                background: 'var(--bg-base)',
                border: '1px solid var(--bg-border)',
                color: 'var(--text-primary)',
                fontFamily: 'inherit',
              }}
            />
            <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>
              {globalCustomPrompt.length} / 500
            </span>
          </div>

          {/* Save button */}
          <div className="flex items-center gap-4">
            <Button type="submit" disabled={aiSaving}>
              {aiSaving ? 'Saving…' : 'Save AI Settings'}
            </Button>
            {aiSaveMsg && (
              <span className="text-sm" style={{ color: aiSaveMsg === 'Saved!' ? 'var(--success, #22c55e)' : 'var(--error)' }}>
                {aiSaveMsg}
              </span>
            )}
          </div>

        </form>
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
