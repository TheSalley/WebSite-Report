'use client'

import * as React from 'react'
import { Spinner } from '@/components/ui'
import type { TaskProgress } from '@/lib/runs-view'

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** 综合当前阶段序号与阶段内进度，估算整体完成度 */
export function overallProgress(progress: TaskProgress | null): number {
  if (!progress || progress.queued) return 0
  const phaseCount = Math.max(progress.phaseCount ?? 0, progress.phaseList?.length ?? 0, 1)
  const phaseIndex = clamp(progress.phaseIndex ?? 1, 1, phaseCount)
  const phaseDone = progress.total > 0 ? clamp(progress.done / progress.total, 0, 1) : 0
  const ratio = (phaseIndex - 1 + phaseDone) / phaseCount
  return clamp(Math.round(ratio * 100), 0, 100)
}

export function TaskProgressBar({
  progress,
  compact = false
}: {
  progress: TaskProgress
  compact?: boolean
}) {
  const queued = progress.queued === true
  const percent = overallProgress(progress)
  const indeterminate = !queued && progress.total === 0
  const phaseCount = Math.max(progress.phaseCount ?? 0, progress.phaseList?.length ?? 0)
  const phaseLabel = progress.phaseName ?? '检测中'
  const stepLabel = phaseCount > 0 && progress.phaseIndex ? `阶段 ${progress.phaseIndex}/${phaseCount}` : ''
  const countLabel = !queued && progress.total > 0 ? `${progress.done}/${progress.total}` : ''
  const headline = queued ? '排队中，等待空闲任务位' : phaseLabel

  return (
    <div className={compact ? 'mt-2 space-y-1' : 'space-y-2'} role="status" aria-live="polite">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
          {queued ? <span className="h-1.5 w-1.5 rounded-full bg-foreground-subtle" /> : <Spinner className="h-3 w-3" />}
          {headline}
        </span>
        {stepLabel && <span className="text-foreground-subtle">{stepLabel}</span>}
        {countLabel && <span className="text-foreground-subtle tabular-nums">{countLabel}</span>}
        <span className="ml-auto shrink-0 font-medium tabular-nums text-foreground-muted">
          {queued || indeterminate ? '准备中' : `${percent}%`}
        </span>
      </div>

      <div
        className={`relative overflow-hidden rounded-full bg-black/[0.07] dark:bg-white/10 ${compact ? 'h-1.5' : 'h-2'}`}
        role="progressbar"
        aria-label={headline}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={indeterminate ? undefined : percent}
      >
        {queued || indeterminate ? (
          <div className="progress-indeterminate h-full w-1/3 rounded-full bg-primary/70" />
        ) : (
          <div
            className="relative h-full rounded-full bg-primary transition-[width] duration-700 ease-out"
            style={{ width: `${percent}%` }}
          >
            {percent > 0 && percent < 100 && <span className="progress-shimmer absolute inset-0 rounded-full" />}
          </div>
        )}
      </div>

      {!compact && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-foreground-subtle">
          {progress.ruleName && <span className="truncate">{progress.ruleName}</span>}
          {progress.error && <span className="text-danger">{progress.error}</span>}
        </div>
      )}

      {!compact && (progress.phaseList?.length ?? 0) > 1 && (
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-foreground-subtle">
          {progress.phaseList!.map((phase, index) => {
            const step = index + 1
            const current = !queued && step === progress.phaseIndex
            const finished = !queued && step < (progress.phaseIndex ?? 0)
            return (
              <li key={phase.id} className="inline-flex items-center gap-1">
                {index > 0 && <span className="mr-1 h-px w-3 bg-border-strong" aria-hidden />}
                <span
                  className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-medium tabular-nums ${
                    current
                      ? 'bg-primary text-primary-foreground'
                      : finished
                        ? 'bg-success-soft text-success-soft-foreground'
                        : 'bg-black/[0.06] text-foreground-subtle dark:bg-white/10'
                  }`}
                >
                  {step}
                </span>
                <span className={current ? 'font-medium text-foreground' : ''}>{phase.name}</span>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
