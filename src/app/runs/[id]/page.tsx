'use client'

import * as React from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  FileText,
  ImageUp,
  Monitor,
  ScrollText,
  Smartphone,
  X,
  CheckCircle2,
  CircleAlert,
  CircleMinus,
  Clock3
} from 'lucide-react'
import { Button, Card, Empty, Input, PageHeader, Select, Spinner, StatusBadge } from '@/components/ui'
import { useConfirm } from '@/components/confirm'
import { TaskProgressBar } from '@/components/task-progress'
import type { CheckResult, CheckStatus } from '@/lib/types'
import type { TaskRow } from '@/lib/runs-view'
import { fmtTime, groupResultsByPage, psShotUrl, STATUS_FILTERS, statusCounts } from '@/lib/runs-view'
import { displayUrl, pageLabel } from '@/lib/display'
import { isArtifactResult, isCheckResult, isDeliverableResult } from '@/lib/rule-kinds'
import { fetchJson, friendlyError } from '@/lib/client-fetch'

const CHECK_STATUS_OPTIONS = [
  { value: 'pass', label: '通过' },
  { value: 'fail', label: '失败' },
  { value: 'skip', label: '跳过' }
]

const DELIVERABLE_STATUS_OPTIONS = [
  { value: 'pass', label: '已确认' },
  { value: 'fail', label: '不通过' },
  { value: 'skip', label: '跳过' },
  { value: 'verify', label: '待验收' }
]

export default function TaskDetailPage() {
  const params = useParams<{ id: string }>()
  const taskId = Number(params.id)
  const confirm = useConfirm()

  const [task, setTask] = React.useState<TaskRow | null>(null)
  const [results, setResults] = React.useState<CheckResult[]>([])
  const [loading, setLoading] = React.useState(true)
  const [resultsLoading, setResultsLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState<CheckStatus | 'all'>('all')
  const [deliverableDrafts, setDeliverableDrafts] = React.useState<Record<number, string>>({})
  const [saving, setSaving] = React.useState(false)
  const [shotUploading, setShotUploading] = React.useState<'' | 'mobile' | 'desktop'>('')
  const [shotVersion, setShotVersion] = React.useState(0)
  const [logsOpen, setLogsOpen] = React.useState(false)
  const [logs, setLogs] = React.useState<string[]>([])
  const [logsLoading, setLogsLoading] = React.useState(false)
  const [cancelling, setCancelling] = React.useState(false)
  const [showPages, setShowPages] = React.useState(false)
  const wasRunningRef = React.useRef(false)
  const shotFileRef = React.useRef<HTMLInputElement | null>(null)
  const shotStrategyRef = React.useRef<'mobile' | 'desktop'>('mobile')
  const runningRef = React.useRef(false)

  const loadResults = React.useCallback(async (showLoading = false) => {
    if (showLoading) setResultsLoading(true)
    try {
      const data = await fetchJson<CheckResult[]>(`/api/tasks/${taskId}/results`)
      setResults(data)
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setResultsLoading(false)
    }
  }, [taskId])

  const loadTask = React.useCallback(async () => {
    try {
      const data = await fetchJson<TaskRow>(`/api/tasks/${taskId}`)
      setTask(data)
      const nextRunning = data.status === 'running' || data.status === 'pending'
      runningRef.current = nextRunning
      if (wasRunningRef.current && !nextRunning) {
        window.setTimeout(() => void loadResults(), 400)
      }
      wasRunningRef.current = nextRunning
      setError('')
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setLoading(false)
    }
  }, [taskId, loadResults])

  React.useEffect(() => {
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = async () => {
      await Promise.all([loadTask(), loadResults()])
      if (!stopped && runningRef.current) timer = setTimeout(tick, 3000)
    }
    void tick()
    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
    }
  }, [loadTask, loadResults])

  const updateStatus = async (resultId: number, status: string) => {
    await fetch(`/api/tasks/${taskId}/results/${resultId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    })
    await Promise.all([loadResults(), loadTask()])
  }

  const saveDeliverables = async () => {
    const ids = Object.keys(deliverableDrafts)
    if (ids.length === 0) return
    setSaving(true)
    try {
      await Promise.all(
        ids.map((id) => fetch(`/api/tasks/${taskId}/results/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deliverable: deliverableDrafts[Number(id)] ?? '' })
        }))
      )
      setDeliverableDrafts({})
      await loadResults()
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setSaving(false)
    }
  }

  const cancelTask = async () => {
    const ok = await confirm({
      title: '终止任务',
      description: `确定终止任务 #${taskId} 吗？已完成的检测结果会被保留。`,
      confirmText: '终止'
    })
    if (!ok) return
    setCancelling(true)
    try {
      await fetch(`/api/tasks/${taskId}/cancel`, { method: 'POST' })
      await loadTask()
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setCancelling(false)
    }
  }

  const loadLogs = async () => {
    if (logsOpen) {
      setLogsOpen(false)
      return
    }
    setLogsOpen(true)
    setLogsLoading(true)
    try {
      const data = await fetchJson<{ lines: string[] }>(`/api/tasks/${taskId}/log`)
      setLogs(data.lines.slice(-200))
    } catch {
      setLogs([])
    } finally {
      setLogsLoading(false)
    }
  }

  const replaceShot = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const strategy = shotStrategyRef.current
    setShotUploading(strategy)
    try {
      const body = new FormData()
      body.append('strategy', strategy)
      body.append('file', file)
      const res = await fetch(`/api/tasks/${taskId}/pagespeed-shot`, { method: 'POST', body })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? '上传失败')
      setShotVersion((v) => v + 1)
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setShotUploading('')
    }
  }

  const checkResults = results.filter(isCheckResult)
  const deliverableResults = results.filter(isDeliverableResult)
  const artifactResults = results.filter(isArtifactResult)
  const visibleChecks = checkResults.filter((result) => statusFilter === 'all' || result.status === statusFilter)
  const visibleDeliverables = deliverableResults.filter(
    (result) =>
      statusFilter === 'all' ||
      (statusFilter === 'verify' && result.status === 'verify') ||
      (statusFilter === 'skip' && result.status === 'skip')
  )
  const psShots = results.some((r) => isArtifactResult(r) && r.ruleKey === 'artifact.pagespeed.shots')
  const hasDrafts = Object.keys(deliverableDrafts).length > 0
  const pages = groupResultsByPage(checkResults)
  const duration = task?.startedAt && task.finishedAt
    ? Math.max(0, Math.round((new Date(task.finishedAt).getTime() - new Date(task.startedAt).getTime()) / 1000))
    : null

  if (loading) {
    return <div className="flex justify-center py-24"><Spinner /></div>
  }

  if (error && !task) {
    return (
      <div className="space-y-5">
        <Link href="/runs" className="inline-flex items-center gap-1.5 text-sm text-foreground-muted hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> 返回检测
        </Link>
        <div className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger-soft-foreground">{error}</div>
      </div>
    )
  }

  if (!task) return null

  return (
    <div className="space-y-7">
      <div>
        <Link href="/runs" className="mb-4 inline-flex items-center gap-1.5 text-sm text-foreground-muted hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> 返回检测
        </Link>
        <PageHeader
          title={task.site?.name ?? `站点 #${task.siteId}`}
          description={displayUrl(task.site?.url ?? '')}
          actions={
            <>
              {task.status === 'running' && (
                <Button variant="outline" onClick={cancelTask} disabled={cancelling}>
                  {cancelling ? <Spinner /> : <X className="h-4 w-4" />} 终止
                </Button>
              )}
              {hasDrafts && (
                <Button onClick={saveDeliverables} disabled={saving}>
                  {saving && <Spinner />} 保存修改
                </Button>
              )}
              {task.status === 'success' && (
                <Link href={`/reports/${task.id}`} target="_blank">
                  <Button variant="outline"><FileText className="h-4 w-4" /> 查看报告</Button>
                </Link>
              )}
            </>
          }
        />
      </div>

      {error && <div className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger-soft-foreground">{error}</div>}

      <Card className="overflow-hidden">
        <div className="grid grid-cols-2 divide-x divide-y divide-border sm:grid-cols-4 sm:divide-y-0">
          <Stat label="状态" value={<StatusBadge status={task.status} />} />
          <Stat label="检测通过" value={<span className="text-success">{task.passCount}</span>} />
          <Stat label="检测失败" value={<span className="text-danger">{task.failCount}</span>} />
          <Stat label="合同待验收" value={<span className="text-primary">{task.verifyCount ?? 0}</span>} />
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border px-5 py-3 text-xs text-foreground-muted">
          <span className="inline-flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" /> {fmtTime(task.startedAt)}</span>
          {duration !== null && <span>耗时 {duration}s</span>}
          <span>{task.ruleSet?.name ?? `规则 #${task.ruleSetId}`}</span>
          <span>任务 #{task.id}</span>
        </div>

        {task.status === 'running' && task.progress && (
          <div className="border-t border-border bg-primary-soft/50 px-5 py-3.5">
            <TaskProgressBar progress={task.progress} />
          </div>
        )}
      </Card>

      {task.pageSet &&
        (task.pageSet.representatives.length > 0 ||
          (task.pageSet.contentCheck && task.pageSet.contentPageCount)) && (
        <Card>
          <button
            type="button"
            onClick={() => setShowPages((v) => !v)}
            className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left"
          >
            <span className="text-sm font-medium">
              检测页面
              <span className="ml-1 font-normal text-foreground-subtle">
                {task.pageSet.representatives.length > 0
                  ? `${task.pageSet.representatives.length} 个代表页`
                  : `${task.pageSet.contentPageCount ?? 0} 个内容链接`}
              </span>
            </span>
            {showPages ? <ChevronUp className="h-4 w-4 text-foreground-subtle" /> : <ChevronDown className="h-4 w-4 text-foreground-subtle" />}
          </button>
          {showPages && (
            <div className="border-t border-border px-5 py-3">
              <p className="mb-2 text-xs text-foreground-muted">
                {task.pageSet.representatives.length > 0
                  ? `从 ${task.pageSet.candidateCount} 个候选 URL 去重模板`
                  : 'sitemap 枚举到的内容链接'}
                {task.pageSet.contentCounts
                  ? `，页面 ${task.pageSet.contentCounts.pages}、新闻 ${task.pageSet.contentCounts.posts}、产品 ${task.pageSet.contentCounts.products}`
                  : task.pageSet.locTotal
                    ? `，sitemap 共 ${task.pageSet.locTotal} 个 URL`
                    : ''}
                {task.pageSet.contentCheck && task.pageSet.contentPageCount
                  ? `。H1 / 隐藏板块逐页检查 ${task.pageSet.contentPageCount} 个内容链接。`
                  : '。'}
              </p>
              <ul className="divide-y divide-border text-xs">
                {task.pageSet.representatives.map((p) => (
                  <li key={p.url} className="flex flex-wrap items-center gap-2 py-2">
                    <span className="min-w-0 flex-1 truncate font-mono text-foreground-muted">{displayUrl(p.url)}</span>
                    <span className="rounded bg-black/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-foreground-subtle dark:bg-white/[0.06]">{p.templateSignature || '—'}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      {resultsLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : results.length === 0 ? (
        <Empty
          icon={<Clock3 className="h-7 w-7" />}
          title={task.status === 'failed' ? '检测失败' : '暂无检测结果'}
          description={task.error || '任务可能尚未完成，或页面未能成功加载。'}
        />
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {STATUS_FILTERS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setStatusFilter(key)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  statusFilter === key
                    ? 'bg-foreground text-background'
                    : 'text-foreground-muted hover:bg-black/[0.05] hover:text-foreground dark:hover:bg-white/[0.07]'
                }`}
              >
                {label} <span className="ml-0.5 opacity-60">{statusCounts(results, key)}</span>
              </button>
            ))}
          </div>

          {psShots && (
            <section className="space-y-3">
              <SectionTitle title="功能产物" description="PageSpeed 移动端与桌面端截图，不参与检测通过率。" />
              <div className="grid gap-3 lg:grid-cols-2">
                {(['mobile', 'desktop'] as const).map((strategy) => (
                  <Card key={strategy} className="overflow-hidden">
                    <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
                      {strategy === 'mobile' ? <Smartphone className="h-4 w-4 text-foreground-subtle" /> : <Monitor className="h-4 w-4 text-foreground-subtle" />}
                      <span className="text-sm font-medium">{strategy === 'mobile' ? '移动端' : '桌面端'}截图</span>
                      <button
                        type="button"
                        onClick={() => {
                          shotStrategyRef.current = strategy
                          shotFileRef.current?.click()
                        }}
                        disabled={shotUploading !== ''}
                        className="ml-auto inline-flex items-center gap-1 text-xs text-foreground-muted hover:text-foreground disabled:opacity-50"
                      >
                        <ImageUp className="h-3.5 w-3.5" /> {shotUploading === strategy ? '上传中…' : '替换'}
                      </button>
                    </div>
                    <div className="bg-black/[0.025] p-3 dark:bg-black/20">
                      <Screenshot src={psShotUrl(task.id, strategy, shotVersion)} alt={`${strategy === 'mobile' ? '移动端' : '桌面端'}截图`} />
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          )}

          {visibleChecks.length > 0 && statusFilter !== 'verify' && (
            <section className="space-y-4">
              <SectionTitle title="机器检测" description={`${checkResults.length} 项，计入通过率。`} />
              {Array.from(pages.entries()).map(([pageUrl, items]) => {
                const pageItems = items.filter((r) => statusFilter === 'all' || r.status === statusFilter)
                if (pageItems.length === 0) return null
                const failures = items.filter((r) => r.status === 'fail').length
                return (
                  <div key={pageUrl || '__home__'} className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-medium">{pageLabel(pageUrl, { max: 70 })}</span>
                      <span className="text-foreground-subtle">{pageItems.length} 项</span>
                      {failures > 0 && <span className="text-danger">{failures} 项失败</span>}
                    </div>
                    <Card className="divide-y divide-border overflow-hidden">
                      {pageItems.map((r) => (
                        <ResultRow key={r.id} result={r} options={CHECK_STATUS_OPTIONS} onStatus={(status) => updateStatus(r.id, status)} />
                      ))}
                    </Card>
                  </div>
                )
              })}
            </section>
          )}

          {visibleDeliverables.length > 0 && (
            <section className="space-y-3">
              <SectionTitle title="合同文案" description="人工确认交付结果，不计入检测通过率。" />
              <Card className="divide-y divide-border overflow-hidden">
                {visibleDeliverables.map((r) => (
                  <div key={r.id} className="px-4 py-3.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={r.status} />
                      <span className="text-sm font-medium">{r.ruleName}</span>
                      <Select
                        value={r.status}
                        onChange={(status) => updateStatus(r.id, status)}
                        options={DELIVERABLE_STATUS_OPTIONS}
                        className="ml-auto h-7 w-[104px] text-xs"
                      />
                    </div>
                    <p className="mt-1 text-xs leading-5 text-foreground-muted">{r.description || '—'}</p>
                    <Input
                      placeholder="交付成果（留空沿用预设文案）"
                      value={deliverableDrafts[r.id] ?? r.deliverable ?? ''}
                      onChange={(e) => setDeliverableDrafts((d) => ({ ...d, [r.id]: e.target.value }))}
                      className="mt-2 h-8 text-xs"
                    />
                  </div>
                ))}
              </Card>
            </section>
          )}

          {statusFilter === 'all' && artifactResults.length > 0 && !psShots && (
            <section className="space-y-3">
              <SectionTitle title="功能产物" description="证据留存，不参与评分。" />
              <Card className="divide-y divide-border overflow-hidden">
                {artifactResults.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
                    <StatusBadge status={r.status} />
                    <span className="text-sm font-medium">{r.ruleName}</span>
                    <span className="text-xs text-foreground-muted">{r.actualValue || r.description || '—'}</span>
                  </div>
                ))}
              </Card>
            </section>
          )}
        </>
      )}

      <Card>
        <button type="button" onClick={loadLogs} className="flex w-full items-center gap-2 px-5 py-3.5 text-left text-sm font-medium">
          <ScrollText className="h-4 w-4 text-foreground-subtle" /> 任务日志
          {logsOpen ? <ChevronUp className="ml-auto h-4 w-4 text-foreground-subtle" /> : <ChevronDown className="ml-auto h-4 w-4 text-foreground-subtle" />}
        </button>
        {logsOpen && (
          <div className="border-t border-border px-5 py-3">
            {logsLoading ? (
              <div className="py-4 text-center"><Spinner /></div>
            ) : logs.length === 0 ? (
              <p className="py-3 text-xs text-foreground-subtle">暂无日志。</p>
            ) : (
              <div className="max-h-80 overflow-auto rounded-md bg-zinc-950 p-3 font-mono text-[11px] leading-relaxed text-zinc-200">
                {logs.map((line, i) => <div key={i} className="whitespace-pre-wrap break-all">{line}</div>)}
              </div>
            )}
          </div>
        )}
      </Card>

      <input ref={shotFileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={replaceShot} />
    </div>
  )
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="px-5 py-4">
      <div className="text-xs text-foreground-subtle">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  )
}

function SectionTitle({ title, description }: { title: string; description?: string }) {
  return (
    <div>
      <h2 className="text-sm font-semibold">{title}</h2>
      {description && <p className="mt-0.5 text-xs text-foreground-muted">{description}</p>}
    </div>
  )
}

function Screenshot({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = React.useState(false)
  if (failed) {
    return <div className="flex h-32 items-center justify-center rounded-md border border-dashed border-border-strong text-xs text-foreground-subtle">截图暂不可用</div>
  }
  return (
    <img
      src={src}
      alt={alt}
      className="max-h-72 w-full cursor-zoom-in rounded-md border border-border object-contain"
      onClick={() => window.open(src, '_blank')}
      onError={() => setFailed(true)}
      loading="lazy"
    />
  )
}

function ResultRow({
  result,
  options,
  onStatus
}: {
  result: CheckResult
  options: { value: string; label: string }[]
  onStatus: (status: string) => void
}) {
  const Icon = result.status === 'pass' ? CheckCircle2 : result.status === 'fail' ? CircleAlert : CircleMinus
  const iconColor = result.status === 'pass' ? 'text-success' : result.status === 'fail' ? 'text-danger' : 'text-foreground-subtle'
  return (
    <div className="flex gap-3 px-4 py-3.5">
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${iconColor}`} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-medium">{result.ruleName}</span>
          <span className="text-xs text-foreground-subtle">{result.groupName}</span>
          <Select value={result.status} onChange={onStatus} options={options} className="ml-auto h-7 w-[92px] text-xs" />
        </div>
        <dl className="mt-1.5 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
          <div className="flex gap-1.5"><dt className="shrink-0 text-foreground-subtle">实际</dt><dd className="min-w-0 break-all text-foreground-muted">{result.actualValue || '—'}</dd></div>
          <div className="flex gap-1.5"><dt className="shrink-0 text-foreground-subtle">预期</dt><dd className="min-w-0 break-all text-foreground-muted">{result.expectedValue || '—'}</dd></div>
        </dl>
        {result.description && <p className="mt-1 text-xs leading-5 text-foreground-subtle">{result.description}</p>}
      </div>
    </div>
  )
}
