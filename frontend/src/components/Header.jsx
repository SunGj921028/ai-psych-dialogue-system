import { NavLink } from 'react-router-dom'
import { FileClock, MessageSquareText, Settings } from 'lucide-react'

const navItems = [
  { to: '/', label: '工作台', icon: MessageSquareText },
  { to: '/history', label: '歷史個案', icon: FileClock },
  { to: '/settings', label: '設定', icon: Settings },
]

export default function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/82 px-4 py-3 shadow-[0_8px_26px_rgba(15,23,42,0.04)] backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-teal-900 text-white shadow-sm">
            <MessageSquareText className="h-4 w-4" />
          </div>
          <div>
          <p className="text-sm font-semibold text-slate-950">
            AI 心理對話與個案概念化系統
          </p>
          <p className="text-xs text-muted-foreground">供諮商師文件審閱使用</p>
          </div>
        </div>
        <nav className="flex flex-wrap gap-1 text-sm" aria-label="主要導覽">
          {navItems.map((item) => {
            const Icon = item.icon

            return (
              <NavLink
                className={({ isActive }) =>
                  [
                    'inline-flex items-center gap-2 rounded-md px-3 py-2 transition',
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-teal-50 hover:text-teal-950',
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
      </div>
    </header>
  )
}
