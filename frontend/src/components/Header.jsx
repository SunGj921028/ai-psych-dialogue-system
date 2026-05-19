import { NavLink } from 'react-router-dom'
import { FileClock, MessageSquareText, Settings } from 'lucide-react'
import ThemeToggle from './ThemeToggle.jsx'

const navItems = [
  { to: '/', label: '工作台', icon: MessageSquareText },
  { to: '/history', label: '歷史個案', icon: FileClock },
  { to: '/settings', label: '設定', icon: Settings },
]

export default function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/82 px-4 py-3 shadow-[0_8px_26px_rgba(15,23,42,0.04)] backdrop-blur dark:border-slate-800/80 dark:bg-slate-950/78 dark:shadow-[0_8px_26px_rgba(0,0,0,0.22)]">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3">
        <div className="flex min-w-[16rem] flex-1 items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm">
            <MessageSquareText className="h-4 w-4" />
          </div>
          <div>
          <p className="text-sm font-semibold text-slate-950 dark:text-slate-50">
            AI 心理對話與個案概念化系統
          </p>
          <p className="text-xs text-muted-foreground">供諮商師文件審閱使用</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
        <nav className="flex flex-wrap rounded-md border border-slate-200/80 bg-slate-50/85 p-1 text-sm shadow-inner dark:border-slate-700/80 dark:bg-slate-800" aria-label="主要導覽">
          {navItems.map((item) => {
            const Icon = item.icon

            return (
              <NavLink
                className={({ isActive }) =>
                  [
                    'inline-flex items-center gap-2 rounded-md px-3 py-1.5 font-medium transition',
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-sm dark:bg-primary dark:text-slate-950'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-slate-50',
                  ].join(' ')
                }
                key={item.to}
                to={item.to}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            )
          })}
        </nav>
        <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
