'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

interface AnswerEntry {
  answer_given: string
  is_correct: boolean
  answered_at: string
}

interface QuestionStat {
  id: string
  question_text: string
  type: 'mcq' | 'short_answer'
  correct_answer: string
  total_attempts: number
  correct_count: number
  accuracy: number
  last_answered_at: string | null
  recent_answers: AnswerEntry[]
}

interface HistoryData {
  studySetName: string
  questions: QuestionStat[]
  overall: {
    total_attempts: number
    correct_count: number
    accuracy: number
    questions_attempted: number
    total_questions: number
  }
}

type SortKey = 'accuracy' | 'attempts' | 'recent'

function accuracyColor(accuracy: number): string {
  if (accuracy >= 0.8) return '#4ade80'
  if (accuracy >= 0.5) return '#fbbf24'
  return '#f87171'
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatShortDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function HistoryPage() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<HistoryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [sort, setSort] = useState<SortKey>('accuracy')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    window.fetch(`/api/history/${id}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
  }, [id])

  function toggleExpand(qid: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(qid)) next.delete(qid); else next.add(qid)
      return next
    })
  }

  const sorted = data ? [...data.questions].sort((a, b) => {
    if (sort === 'accuracy') {
      if (a.total_attempts === 0 && b.total_attempts === 0) return 0
      if (a.total_attempts === 0) return 1
      if (b.total_attempts === 0) return -1
      return a.accuracy - b.accuracy
    }
    if (sort === 'attempts') return b.total_attempts - a.total_attempts
    if (!a.last_answered_at) return 1
    if (!b.last_answered_at) return -1
    return new Date(b.last_answered_at).getTime() - new Date(a.last_answered_at).getTime()
  }) : []

  return (
    <>
      <style>{`
        .hist-bg {
          position: fixed; inset: 0; z-index: 0; pointer-events: none;
          background-image:
            linear-gradient(rgba(0,201,255,0.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,201,255,0.025) 1px, transparent 1px);
          background-size: 48px 48px;
        }
        .hist-wrap { position: relative; z-index: 1; }

        .stat-tile {
          flex: 1; min-width: 140px;
          background: var(--bg-surface);
          border: 1px solid var(--bg-border);
          border-radius: 14px;
          padding: 1.25rem 1.5rem;
        }
        .stat-num {
          font-size: 2.75rem; font-weight: 800; line-height: 1;
          letter-spacing: -0.04em; font-variant-numeric: tabular-nums;
        }
        .stat-sub {
          font-size: 0.65rem; font-weight: 600; letter-spacing: 0.14em;
          text-transform: uppercase; color: var(--text-muted); margin-top: 0.4rem;
        }
        .acc-track {
          height: 2px; background: var(--bg-border);
          border-radius: 999px; overflow: hidden; margin-top: 0.875rem;
        }
        .acc-fill { height: 100%; border-radius: 999px; transition: width 0.7s cubic-bezier(0.16,1,0.3,1); }

        .sort-pill {
          padding: 0.3rem 0.75rem; border-radius: 999px;
          font-size: 0.7rem; font-weight: 600; letter-spacing: 0.08em;
          text-transform: uppercase; cursor: pointer;
          border: 1px solid var(--bg-border);
          background: transparent; color: var(--text-muted);
          transition: all 0.15s;
        }
        .sort-pill.on { background: var(--accent-cyan); color: var(--bg-base); border-color: var(--accent-cyan); }
        .sort-pill:not(.on):hover { border-color: rgba(0,201,255,0.35); color: var(--text-primary); }

        .q-card {
          border: 1px solid var(--bg-border);
          border-radius: 11px; background: var(--bg-surface);
          margin-bottom: 0.5rem; overflow: hidden;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .q-card:hover { border-color: rgba(0,201,255,0.25); box-shadow: 0 0 0 1px rgba(0,201,255,0.08); }

        .q-header {
          display: grid; grid-template-columns: 1fr auto;
          align-items: center; gap: 1rem;
          padding: 0.875rem 1rem; cursor: pointer;
        }
        .q-text {
          font-size: 0.875rem; color: var(--text-primary);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .q-meta { display: flex; align-items: center; gap: 0.875rem; flex-shrink: 0; }

        .mini-bar-track { width: 52px; height: 3px; background: var(--bg-border); border-radius: 999px; overflow: hidden; }
        .mini-bar-fill { height: 100%; border-radius: 999px; }

        .pct { font-size: 0.8rem; font-weight: 700; font-variant-numeric: tabular-nums; min-width: 2.75rem; text-align: right; }
        .tries { font-size: 0.72rem; color: var(--text-muted); font-variant-numeric: tabular-nums; min-width: 2.25rem; text-align: right; }
        .chevron { font-size: 0.55rem; color: var(--text-muted); transition: transform 0.2s; }
        .chevron.open { transform: rotate(180deg); }

        .not-tried {
          font-size: 0.65rem; font-weight: 600; letter-spacing: 0.1em;
          text-transform: uppercase; color: var(--text-muted);
          border: 1px solid var(--bg-border); border-radius: 4px;
          padding: 0.2rem 0.5rem;
        }

        .q-detail {
          border-top: 1px solid var(--bg-border);
          background: var(--bg-base);
          padding: 0.875rem 1rem;
        }
        .detail-label { font-size: 0.625rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 0.2rem; }

        .dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; margin-top: 4px; }

        @keyframes slideIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .slide-in { animation: slideIn 0.25s ease forwards; }
        .stagger-1 { animation-delay: 0.04s; opacity: 0; }
        .stagger-2 { animation-delay: 0.08s; opacity: 0; }
        .stagger-3 { animation-delay: 0.12s; opacity: 0; }

        @keyframes shimmer { to { background-position: -200% center; } }
        .loading-text {
          font-size: 0.75rem; letter-spacing: 0.2em; text-transform: uppercase;
          background: linear-gradient(90deg, var(--text-muted) 25%, var(--accent-cyan) 50%, var(--text-muted) 75%);
          background-size: 200% auto;
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
          animation: shimmer 1.6s linear infinite;
        }
      `}</style>

      <div className="hist-bg" />

      <main className="hist-wrap" style={{ minHeight: '100vh', background: 'var(--bg-base)', padding: '2rem 1.5rem', maxWidth: '820px', margin: '0 auto' }}>

        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
            <span className="loading-text">Loading Records…</span>
          </div>
        )}

        {!loading && data && (
          <>
            {/* Header */}
            <div className="slide-in" style={{ marginBottom: '2rem' }}>
              <Link href="/dashboard" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', textDecoration: 'none', marginBottom: '1.25rem' }}>
                ← Dashboard
              </Link>
              <h1 className="font-display" style={{ fontSize: 'clamp(1.5rem, 4vw, 2rem)', fontWeight: 800, marginBottom: '0.25rem' }}>
                {data.studySetName}
              </h1>
              <p style={{ fontSize: '0.7rem', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                Answer History
              </p>
            </div>

            {/* Stats row */}
            <div className="slide-in stagger-1" style={{ display: 'flex', gap: '0.75rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
              <div className="stat-tile">
                <div className="stat-num" style={{ color: 'var(--accent-cyan)' }}>
                  {data.overall.total_attempts.toLocaleString()}
                </div>
                <div className="stat-sub">Total Attempts</div>
              </div>

              <div className="stat-tile">
                <div className="stat-num" style={{
                  color: data.overall.total_attempts === 0
                    ? 'var(--text-muted)'
                    : accuracyColor(data.overall.accuracy),
                }}>
                  {data.overall.total_attempts > 0
                    ? `${Math.round(data.overall.accuracy * 100)}%`
                    : '—'}
                </div>
                <div className="stat-sub">Overall Accuracy</div>
                {data.overall.total_attempts > 0 && (
                  <div className="acc-track">
                    <div className="acc-fill" style={{
                      width: `${data.overall.accuracy * 100}%`,
                      background: accuracyColor(data.overall.accuracy),
                    }} />
                  </div>
                )}
              </div>

              <div className="stat-tile">
                <div className="stat-num" style={{ color: 'var(--text-primary)' }}>
                  {data.overall.questions_attempted}
                  <span style={{ fontSize: '1.25rem', fontWeight: 400, color: 'var(--text-muted)' }}>
                    /{data.overall.total_questions}
                  </span>
                </div>
                <div className="stat-sub">Questions Practised</div>
              </div>
            </div>

            {/* Sort + count */}
            <div className="slide-in stagger-2" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', marginRight: '0.125rem' }}>Sort</span>
              {(['accuracy', 'attempts', 'recent'] as SortKey[]).map(s => (
                <button key={s} onClick={() => setSort(s)} className={`sort-pill${sort === s ? ' on' : ''}`}>
                  {s === 'accuracy' ? 'Weakest first' : s === 'attempts' ? 'Most tried' : 'Recent'}
                </button>
              ))}
              <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {sorted.length} questions
              </span>
            </div>

            {/* Empty state */}
            {data.overall.total_attempts === 0 && (
              <div className="slide-in stagger-3" style={{ textAlign: 'center', padding: '5rem 1rem' }}>
                <p style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📋</p>
                <p style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: '0.375rem' }}>No attempts yet</p>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                  Start a study session to begin tracking your progress.
                </p>
                <Link href={`/study/${id}`} style={{
                  display: 'inline-block', padding: '0.625rem 1.5rem',
                  background: 'var(--accent-cyan)', color: 'var(--bg-base)',
                  borderRadius: '8px', fontWeight: 700, fontSize: '0.875rem', textDecoration: 'none',
                }}>
                  Study Now
                </Link>
              </div>
            )}

            {/* Question list */}
            <div className="slide-in stagger-3">
              {sorted.map(q => {
                const isOpen = expanded.has(q.id)
                const color = q.total_attempts > 0 ? accuracyColor(q.accuracy) : 'var(--text-muted)'
                return (
                  <div key={q.id} className="q-card">
                    <div className="q-header" onClick={() => toggleExpand(q.id)}>
                      <p className="q-text">{q.question_text}</p>
                      <div className="q-meta">
                        {q.total_attempts === 0 ? (
                          <span className="not-tried">Not tried</span>
                        ) : (
                          <>
                            <div className="mini-bar-track">
                              <div className="mini-bar-fill" style={{ width: `${q.accuracy * 100}%`, background: color }} />
                            </div>
                            <span className="pct" style={{ color }}>{Math.round(q.accuracy * 100)}%</span>
                            <span className="tries">{q.total_attempts}×</span>
                          </>
                        )}
                        <span className={`chevron${isOpen ? ' open' : ''}`}>▼</span>
                      </div>
                    </div>

                    {isOpen && (
                      <div className="q-detail">
                        <div style={{ display: 'flex', gap: '2rem', marginBottom: q.recent_answers.length ? '1rem' : 0, flexWrap: 'wrap' }}>
                          <div>
                            <p className="detail-label">Correct answer</p>
                            <p style={{ fontSize: '0.875rem', fontWeight: 600, color: '#4ade80' }}>{q.correct_answer}</p>
                          </div>
                          <div>
                            <p className="detail-label">Type</p>
                            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                              {q.type === 'mcq' ? 'Multiple choice' : 'Short answer'}
                            </p>
                          </div>
                          {q.last_answered_at && (
                            <div>
                              <p className="detail-label">Last attempted</p>
                              <p style={{ fontSize: '0.875rem', color: 'var(--text-primary)' }}>{formatDate(q.last_answered_at)}</p>
                            </div>
                          )}
                          {q.total_attempts > 0 && (
                            <div>
                              <p className="detail-label">Correct / Total</p>
                              <p style={{ fontSize: '0.875rem', fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>
                                {q.correct_count} / {q.total_attempts}
                              </p>
                            </div>
                          )}
                        </div>

                        {q.recent_answers.length > 0 && (
                          <div>
                            <p className="detail-label" style={{ marginBottom: '0.5rem' }}>
                              Last {q.recent_answers.length} attempt{q.recent_answers.length !== 1 ? 's' : ''}
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                              {q.recent_answers.map((a, j) => (
                                <div key={j} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.625rem' }}>
                                  <div className="dot" style={{ background: a.is_correct ? '#4ade80' : '#f87171' }} />
                                  <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)', flex: 1 }}>{a.answer_given}</span>
                                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', flexShrink: 0 }}>{formatShortDate(a.answered_at)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </main>
    </>
  )
}
