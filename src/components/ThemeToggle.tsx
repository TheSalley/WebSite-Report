'use client'

import { Moon, Sun, Monitor } from 'lucide-react'
import { useTheme } from '@/lib/theme'

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  const next: Record<string, 'light' | 'dark' | 'auto'> = {
    light: 'dark',
    dark: 'auto',
    auto: 'light'
  }
  const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor
  const label = theme === 'light' ? '浅色' : theme === 'dark' ? '深色' : '跟随系统'

  return (
    <button
      onClick={() => setTheme(next[theme])}
      title={`主题：${label}（点击切换）`}
      aria-label={`当前${label}模式，点击切换主题`}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
    >
      <Icon className="h-4 w-4" />
    </button>
  )
}
