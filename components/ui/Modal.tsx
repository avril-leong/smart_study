'use client'
import { useEffect } from 'react'
import { Card } from './Card'

interface ModalProps { open: boolean; onClose: () => void; children: React.ReactNode; title: string }

export function Modal({ open, onClose, children, title }: ModalProps) {
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
  }, [open])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <Card className="w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-display font-bold text-lg">{title}</h2>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }} className="text-xl leading-none">×</button>
        </div>
        {children}
      </Card>
    </div>
  )
}
