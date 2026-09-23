'use client'

import * as React from 'react'
import { X } from 'lucide-react'

/* ── Button ── */
export function Button({
  className = '',
  variant = 'default',
  size = 'md',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'outline' | 'ghost' | 'danger' | 'success'
  size?: 'sm' | 'md' | 'lg'
}) {
  const variants: Record<string, string> = {
    default:
      'bg-primary text-primary-foreground shadow-sm hover:bg-primary-hover active:translate-y-[0.5px]',
    outline:
      'border border-border-strong bg-background-elevated text-foreground shadow-sm hover:bg-zinc-50 hover:border-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:border-zinc-600',
    ghost: 'text-foreground-muted hover:bg-zinc-100 hover:text-foreground dark:hover:bg-zinc-800',
    danger: 'bg-danger text-white shadow-sm hover:opacity-90',
    success: 'bg-success text-white shadow-sm hover:opacity-90'
  }
  const sizes: Record<string, string> = {
    sm: 'h-8 px-3 text-xs gap-1.5',
    md: 'h-9 px-4 text-sm gap-2',
    lg: 'h-10 px-6 text-sm gap-2'
  }
  return (
    <button
      className={`inline-flex items-center justify-center rounded-md font-medium transition-all disabled:pointer-events-none disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    />
  )
}

/* ── Input ── */
export function Input({ className = '', ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`h-9 w-full rounded-md border border-border bg-background-elevated px-3 text-sm text-foreground shadow-sm outline-none transition placeholder:text-foreground-subtle focus:border-primary focus:ring-2 focus:ring-primary/20 dark:bg-background-elevated ${className}`}
      {...props}
    />
  )
}

export function Textarea({ className = '', ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`w-full rounded-md border border-border bg-background-elevated px-3 py-2 text-sm text-foreground shadow-sm outline-none transition placeholder:text-foreground-subtle focus:border-primary focus:ring-2 focus:ring-primary/20 ${className}`}
      {...props}
    />
  )
}

export function Label({ className = '', ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={`text-sm font-medium text-foreground ${className}`} {...props} />
}

/* ── Select ── */
export function Select({
  value,
  onChange,
  options,
  className = ''
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  className?: string
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`h-9 rounded-md border border-border bg-background-elevated px-2.5 text-sm text-foreground shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 ${className}`}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

/* ── Switch ── */
export function Switch({ checked, onCheckedChange }: { checked: boolean; onCheckedChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
        checked ? 'bg-success' : 'bg-zinc-300 dark:bg-zinc-700'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-[18px]' : 'translate-x-[2px]'
        }`}
      />
    </button>
  )
}

/* ── Badge ── */
export function Badge({
  children,
  color = 'gray'
}: {
  children: React.ReactNode
  color?: 'green' | 'amber' | 'red' | 'gray' | 'blue'
}) {
  const colors: Record<string, string> = {
    green: 'bg-success-soft text-success-soft-foreground',
    amber: 'bg-warning-soft text-warning-soft-foreground',
    red: 'bg-danger-soft text-danger-soft-foreground',
    gray: 'bg-zinc-100 text-foreground-muted dark:bg-zinc-800',
    blue: 'bg-primary-soft text-primary-soft-foreground'
  }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${colors[color]}`}>
      {children}
    </span>
  )
}

/* ── Card ── */
export function Card({ className = '', children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={`rounded-xl border border-border bg-background-elevated shadow-sm dark:border-border ${className}`}
    >
      {children}
    </div>
  )
}

/* ── Dialog ── */
export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  width = 'max-w-lg'
}: {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  footer?: React.ReactNode
  width?: string
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative w-full ${width} rounded-xl border border-border bg-background-elevated shadow-lg dark:border-border`}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="text-base font-semibold">{title}</h3>
          <button
            onClick={onClose}
            className="rounded p-1 text-foreground-subtle hover:bg-zinc-100 hover:text-foreground dark:hover:bg-zinc-800"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}

/* ── Empty state ── */
export function Empty({ icon, title, description }: { icon?: React.ReactNode; title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border-strong py-12 text-center">
      {icon && <div className="text-foreground-subtle">{icon}</div>}
      <div className="text-sm font-medium text-foreground-muted">{title}</div>
      {description && <div className="max-w-sm text-xs text-foreground-subtle">{description}</div>}
    </div>
  )
}

/* ── Spinner ── */
export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-primary dark:border-zinc-700 ${className}`}
    />
  )
}

/* ── 状态徽章（检测结果） ── */
export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: 'green' | 'amber' | 'red' | 'gray' | 'blue' }> = {
    pass: { label: '通过', color: 'green' },
    warn: { label: '通过', color: 'green' },
    fail: { label: '失败', color: 'red' },
    skip: { label: '跳过', color: 'gray' },
    verify: { label: '待验收', color: 'blue' },
    success: { label: '成功', color: 'green' },
    running: { label: '运行中', color: 'blue' },
    pending: { label: '排队中', color: 'gray' },
    failed: { label: '失败', color: 'red' },
    stopped: { label: '已停止', color: 'gray' }
  }
  const item = map[status] ?? { label: status, color: 'gray' as const }
  return <Badge color={item.color}>{item.label}</Badge>
}

/* ── 得分环 ── */
export function ScoreRing({ score, size = 88 }: { score: number; size?: number }) {
  const color = score >= 90 ? 'var(--success)' : score >= 70 ? 'var(--warning)' : 'var(--danger)'
  const r = (size - 10) / 2
  const c = 2 * Math.PI * r
  const offset = c * (1 - Math.min(Math.max(score, 0), 100) / 100)
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth="8" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className="transition-all duration-700"
        />
      </svg>
      <span className="absolute font-mono text-2xl font-bold" style={{ color }}>
        {score}
      </span>
    </div>
  )
}
