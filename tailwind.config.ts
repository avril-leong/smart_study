import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './hooks/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['var(--font-display)', 'sans-serif'],
        body: ['var(--font-body)', 'sans-serif'],
      },
      colors: {
        base: '#080d1a',
        surface: '#111827',
        border: '#1e293b',
        cyan: '#00c9ff',
        amber: '#f59e0b',
        success: '#10b981',
        error: '#f43f5e',
      },
    },
  },
  plugins: [],
}
export default config
