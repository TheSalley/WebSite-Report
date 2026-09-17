'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ShieldCheck, Globe, ListChecks, FileText, Settings, Activity } from 'lucide-react'
import ThemeToggle from './ThemeToggle'

const navItems = [
  { href: '/runs', label: '检测与历史', icon: Activity },
  { href: '/sites', label: '站点管理', icon: Globe },
  { href: '/rules', label: '规则集管理', icon: ListChecks },
  { href: '/reports/settings', label: '报告设置', icon: Settings },
  { href: '/docs', label: '使用说明', icon: FileText }
]

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  const isActive = (href: string) => {
    if (href === '/runs') return pathname === '/runs' || pathname === '/'
    return pathname.startsWith(href)
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* 桌面侧边栏 */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col border-r border-border bg-background-elevated md:flex">
        {/* 品牌区 */}
        <div className="flex h-14 items-center gap-2.5 border-b border-border px-5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary shadow-sm">
            <ShieldCheck className="h-4.5 w-4.5 text-primary-foreground" />
          </span>
          <div className="leading-tight">
            <div className="text-sm font-semibold">网站合规性检测</div>
            <div className="text-[10px] text-foreground-subtle">Web Compliance Checker</div>
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 p-3">
          {navItems.map((item) => {
            const active = isActive(item.href)
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-all ${
                  active
                    ? 'bg-primary-soft font-medium text-primary-soft-foreground shadow-sm'
                    : 'text-foreground-muted hover:bg-zinc-100 hover:text-foreground dark:hover:bg-zinc-800/60'
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
          <span className="text-[11px] text-foreground-subtle">v0.1.0 · 本地检测</span>
        </div>
      </aside>

      {/* 移动端顶栏 */}
      <div className="fixed inset-x-0 top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-background-elevated px-4 md:hidden">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
            <ShieldCheck className="h-4 w-4 text-primary-foreground" />
          </span>
          <span className="text-sm font-semibold">网站合规性检测</span>
        </div>
        <ThemeToggle />
      </div>

      <main className="min-h-screen w-full md:pl-60">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8">{children}</div>
      </main>
    </div>
  )
}
