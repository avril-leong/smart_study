'use client'
import { useEffect } from 'react'
import { Card } from './Card'

interface ModalProps { open: boolean; onClose: () => void; children: React.ReactNode; title: string }

export function Modal({ open, onClose, children, title }: ModalProps) {
  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => {
      document.body.style.overflow = ''
      document.removeEventListener('keydown', handler)
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <Card className="w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h2 id="modal-title" className="font-display font-bold text-lg">{title}</h2>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-xl leading-none transition-colors hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-cyan)]"
            style={{ color: 'var(--text-muted)' }}
            aria-label="Close"
          >×</button>
        </div>
        {children}
      </Card>
    </div>
  )
}
