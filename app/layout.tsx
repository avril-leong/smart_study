import type { Metadata } from 'next'
import { Syne, Plus_Jakarta_Sans } from 'next/font/google'
import './globals.css'

const syne = Syne({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['400', '600', '700', '800'],
})

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-body',
  weight: ['400', '500', '600'],
})

export const metadata: Metadata = {
  title: 'SmartStudy',
  description: 'AI-powered adaptive study app',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${syne.variable} ${jakarta.variable}`}>
      <body style={{ fontFamily: 'var(--font-body)' }}>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-lg focus:text-sm focus:font-semibold"
          style={{ background: 'var(--accent-cyan)', color: 'var(--text-on-accent)' } as React.CSSProperties}
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  )
}
