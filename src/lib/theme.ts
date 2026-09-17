'use client'

import * as React from 'react'

export type Theme = 'light' | 'dark' | 'auto'

const THEME_KEY = 'preferred-theme'

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** 主题管理：light / dark / auto，遵循设计令牌规范（theme-switching.md） */
export function useTheme() {
  const [theme, setThemeState] = React.useState<Theme>(() => {
    if (typeof window === 'undefined') return 'auto'
    const stored = window.localStorage.getItem(THEME_KEY) as Theme | null
    return stored && ['light', 'dark', 'auto'].includes(stored) ? stored : 'auto'
  })

  const [resolved, setResolved] = React.useState<'light' | 'dark'>('light')

  React.useEffect(() => {
    const apply = () => {
      const actual = theme === 'auto' ? getSystemTheme() : theme
      setResolved(actual)
      document.documentElement.classList.toggle('dark', actual === 'dark')
      // 移动端地址栏主题色
      let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
      if (!meta) {
        meta = document.createElement('meta')
        meta.name = 'theme-color'
        document.head.appendChild(meta)
      }
      meta.content = actual === 'dark' ? '#0b0e14' : '#f8fafc'
    }
    apply()
    window.localStorage.setItem(THEME_KEY, theme)
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      if (theme === 'auto') apply()
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [theme])

  const setTheme = React.useCallback((t: Theme) => {
    setThemeState(t)
    window.localStorage.setItem(THEME_KEY, t)
  }, [])

  return { theme, resolved, setTheme }
}
