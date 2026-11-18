'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Globe, ListChecks, Settings, Activity, LayoutDashboard } from 'lucide-react'
import ThemeToggle from './ThemeToggle'

const navItems = [
  { href: '/', label: '概览', icon: LayoutDashboard },
  { href: '/runs', label: '检测', icon: Activity },
  { href: '/sites', label: '站点', icon: Globe },
  { href: '/rules', label: '规则', icon: ListChecks },
  { href: '/reports/settings', label: '报告设置', icon: Settings }
]

export default function Shell({ children, version }: { children: React.ReactNode; version: string }) {
  const pathname = usePathname()

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/'
    return pathname.startsWith(href)
  }

  return (
    <div className="flex min-h-screen text-foreground">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-56 flex-col border-r border-border bg-panel md:flex">
        <div className="flex h-16 items-center px-5">
          <Link href="/" aria-label="返回概览">
            <img src="/logo.svg" alt="KUKA" className="h-8 w-auto object-contain" />
          </Link>
        </div>

        <nav className="flex-1 space-y-0.5 px-3 py-2">
          {navItems.map((item) => {
            const active = isActive(item.href)
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
                  active
                    ? 'bg-primary-soft font-medium text-primary-soft-foreground'
                    : 'text-foreground-muted hover:bg-black/[0.04] hover:text-foreground dark:hover:bg-white/[0.06]'
                }`}
              >
                <Icon className={`h-4 w-4 ${active ? 'text-primary' : 'text-foreground-subtle group-hover:text-foreground'}`} />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="flex items-center justify-between border-t border-border p-3">
          <ThemeToggle />
          <span className="flex items-center gap-1.5 text-[11px] text-foreground-subtle">
            <span>本地检测</span>
            <span>v{version}</span>
          </span>
        </div>
      </aside>

      <div className="fixed inset-x-0 top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-panel px-4 md:hidden">
        <img src="/logo.svg" alt="KUKA" className="h-7 w-auto object-contain" />
        <ThemeToggle />
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-border bg-panel pb-[env(safe-area-inset-bottom)] md:hidden">
        {navItems.map((item) => {
          const active = isActive(item.href)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-1 py-2 text-[10px] transition-colors ${
                active ? 'font-medium text-primary' : 'text-foreground-subtle'
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <main className="min-h-screen w-full md:pl-56">
        <div className="mx-auto w-full max-w-6xl px-4 pb-24 pt-20 md:px-8 md:py-10">{children}</div>
      </main>
    </div>
  )
}
