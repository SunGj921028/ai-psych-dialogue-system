import { NavLink } from 'react-router-dom'

const navItems = [
  { to: '/', label: '會談工作台' },
  { to: '/history', label: '個案歷史' },
  { to: '/settings', label: '設定' },
]

export default function Header() {
  return (
    <header className="border-b bg-card px-4 py-3">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">AI 諮商文件輔助系統</p>
          <p className="text-xs text-muted-foreground">供諮商師審閱使用</p>
        </div>
        <nav className="flex flex-wrap gap-2 text-sm">
          {navItems.map((item) => (
            <NavLink
              className={({ isActive }) =>
                [
                  'rounded-md px-3 py-2',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                ].join(' ')
              }
              key={item.to}
              to={item.to}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  )
}
