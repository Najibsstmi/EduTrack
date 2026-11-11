import {
  BookOpenCheck,
  ClipboardPlus,
  History,
  Home,
  KeyRound,
  LogOut,
  Menu,
  Palette,
  X,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useSession } from '../session/useSession'

const navItems = [
  { to: '/', label: 'Utama', icon: Home },
  { to: '/activity/new', label: 'Aktiviti Baharu', icon: ClipboardPlus },
  { to: '/history', label: 'Sejarah', icon: History },
]

export function AppLayout({ children }: { children: ReactNode }) {
  const { data, logout } = useSession()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const roleItems = data?.access.role === 'viewer' ? navItems.filter((item) => item.to !== '/activity/new') : navItems
  const items = data?.access.role === 'admin'
    ? [
        ...roleItems,
        { to: '/admin/access', label: 'Kod Guru', icon: KeyRound },
        { to: '/admin/art-fields', label: 'Bidang Seni', icon: Palette },
      ]
    : roleItems

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition ${
      isActive
        ? 'bg-brand-50 text-brand-800'
        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
    }`

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <NavLink to="/" className="flex items-center gap-3" aria-label="PAJSK Entry">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-800 text-white">
              <BookOpenCheck className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <div className="font-bold leading-tight text-slate-950">PAJSK Entry</div>
              <div className="text-xs text-slate-500">Sekolah Seni Malaysia Johor</div>
            </div>
          </NavLink>

          <div className="hidden items-center gap-3 md:flex">
            <div className="text-right">
              <div className="text-sm font-semibold text-slate-800">{data?.access.display_name}</div>
              <div className="text-xs capitalize text-slate-500">{data?.access.role}</div>
            </div>
            <button type="button" className="btn-secondary min-h-10 px-3" onClick={() => void logout()}>
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Keluar
            </button>
          </div>

          <button
            type="button"
            className="rounded-xl border border-slate-300 p-2 text-slate-700 md:hidden"
            onClick={() => setMobileMenuOpen((value) => !value)}
            aria-label={mobileMenuOpen ? 'Tutup menu' : 'Buka menu'}
          >
            {mobileMenuOpen ? <X /> : <Menu />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="border-t border-slate-200 bg-white p-4 md:hidden">
            <div className="mb-3 text-sm">
              <div className="font-semibold text-slate-800">{data?.access.display_name}</div>
              <div className="capitalize text-slate-500">{data?.access.role}</div>
            </div>
            <nav className="space-y-1">
              {items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={linkClass}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <item.icon className="h-5 w-5" aria-hidden="true" />
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <button
              type="button"
              className="mt-3 flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
              onClick={() => void logout()}
            >
              <LogOut className="h-5 w-5" aria-hidden="true" />
              Keluar
            </button>
          </div>
        )}
      </header>

      <div className="mx-auto flex max-w-7xl gap-6 px-4 pb-24 pt-5 sm:px-6 md:pb-8">
        <aside className="hidden w-56 shrink-0 md:block">
          <nav className="sticky top-20 space-y-1">
            {items.map((item) => (
              <NavLink key={item.to} to={item.to} className={linkClass}>
                <item.icon className="h-5 w-5" aria-hidden="true" />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid border-t border-slate-200 bg-white px-2 py-1.5 md:hidden" style={{ gridTemplateColumns: `repeat(${Math.min(items.length, 4)}, minmax(0, 1fr))` }}>
        {items.slice(0, 4).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-semibold ${
                isActive ? 'text-brand-800' : 'text-slate-500'
              }`
            }
          >
            <item.icon className="h-5 w-5" aria-hidden="true" />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
