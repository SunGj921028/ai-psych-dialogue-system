import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../hooks/useTheme.js'

export default function ThemeToggle() {
  const { isDark, toggleTheme } = useTheme()
  const label = isDark ? '切換至淺色模式' : '切換至深色模式'
  const Icon = isDark ? Sun : Moon

  return (
    <button
      aria-label={label}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-200/80 bg-white/85 text-slate-700 shadow-sm transition hover:bg-slate-100 hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background dark:border-slate-700/80 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-50"
      onClick={toggleTheme}
      title={label}
      type="button"
    >
      <Icon className="h-4 w-4" />
    </button>
  )
}
