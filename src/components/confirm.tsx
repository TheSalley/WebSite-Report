'use client'

import * as React from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from './ui'

export type ConfirmOptions = {
  title: string
  /** 正文说明，支持纯文本或任意节点 */
  description?: React.ReactNode
  confirmText?: string
  cancelText?: string
  /** 危险操作（默认 true），为 false 时确认按钮使用主色 */
  danger?: boolean
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = React.createContext<ConfirmFn | null>(null)

/** 全局确认弹窗：把 window.confirm 换成统一风格的 div 弹窗 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = React.useState<ConfirmOptions | null>(null)
  const resolveRef = React.useRef<((confirmed: boolean) => void) | null>(null)

  const settle = React.useCallback((confirmed: boolean) => {
    const resolve = resolveRef.current
    resolveRef.current = null
    setPending(null)
    resolve?.(confirmed)
  }, [])

  const confirm = React.useCallback<ConfirmFn>((options) => {
    // 若已有弹窗未关闭，先按取消处理，避免旧 Promise 悬挂
    resolveRef.current?.(false)
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve
      setPending(options)
    })
  }, [])

  React.useEffect(() => {
    if (!pending) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        settle(false)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [pending, settle])

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => settle(false)} />
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="app-confirm-title"
            aria-describedby={pending.description ? 'app-confirm-description' : undefined}
            className="relative w-full max-w-sm rounded-xl border border-border bg-background p-5 shadow-2xl shadow-black/15"
          >
            <div className="flex gap-3.5">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                  pending.danger === false
                    ? 'bg-primary-soft text-primary-soft-foreground'
                    : 'bg-danger-soft text-danger-soft-foreground'
                }`}
              >
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 id="app-confirm-title" className="text-sm font-semibold text-foreground">
                  {pending.title}
                </h3>
                {pending.description && (
                  <div
                    id="app-confirm-description"
                    className="mt-1.5 whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground-muted"
                  >
                    {pending.description}
                  </div>
                )}
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => settle(false)} autoFocus>
                {pending.cancelText ?? '取消'}
              </Button>
              <Button
                variant={pending.danger === false ? 'default' : 'danger'}
                size="sm"
                onClick={() => settle(true)}
              >
                {pending.confirmText ?? '确认'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}

export function useConfirm(): ConfirmFn {
  const context = React.useContext(ConfirmContext)
  if (!context) throw new Error('useConfirm 必须在 <ConfirmProvider> 内使用')
  return context
}
