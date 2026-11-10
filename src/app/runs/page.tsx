'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Play, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react'
import { Button, Card, Dialog, Empty, PageHeader, Select, Spinner, StatusBadge } from '@/components/ui'
import { useConfirm } from '@/components/confirm'
import type { RuleSet, Site } from '@/lib/types'
import type { TaskRow } from '@/lib/runs-view'
import { fmtTime } from '@/lib/runs-view'
import { displayUrl } from '@/lib/display'
import { fetchJson, friendlyError } from '@/lib/client-fetch'

type TaskListResponse = {
  items: TaskRow[]
  total: number
  page: number
  pageSize: number
  running: number
}

export default function RunsPage() {
  const confirm = useConfirm()
  const router = useRouter()
  const [tasks, setTasks] = React.useState<TaskRow[]>([])
  const [sites, setSites] = React.useState<Site[]>([])
  const [ruleSets, setRuleSets] = React.useState<RuleSet[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [total, setTotal] = React.useState(0)
  const [running, setRunning] = React.useState(0)
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(10)
  const [startOpen, setStartOpen] = React.useState(false)
  const [siteId, setSiteId] = React.useState('')
  const [ruleSetId, setRuleSetId] = React.useState('')
  const [starting, setStarting] = React.useState(false)
  const runningRef = React.useRef(0)

  const load = React.useCallback(async () => {
    try {
      const [taskData, siteData, setData] = await Promise.all([
        fetchJson<TaskListResponse>(`/api/tasks?page=${page}&pageSize=${pageSize}`),
        fetchJson<Site[]>('/api/sites'),
        fetchJson<RuleSet[]>('/api/rulesets')
      ])
      setTasks(taskData.items)
      setTotal(taskData.total)
      setRunning(taskData.running)
      runningRef.current = taskData.running
      setSites(siteData)
      setRuleSets(setData)
      setError('')
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setLoading(false)
    }
  }, [page, pageSize])

  React.useEffect(() => {
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = async () => {
      await load()
      if (!stopped && runningRef.current > 0) timer = setTimeout(tick, 3000)
    }
    void tick()
    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
    }
  }, [load])

  const openStart = () => {
    setSiteId(sites[0] ? String(sites[0].id) : '')
    setRuleSetId(ruleSets[0] ? String(ruleSets[0].id) : '')
    setStartOpen(true)
  }

  const startRun = async () => {
    setStarting(true)
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: Number(siteId), ruleSetId: Number(ruleSetId) })
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? '启动失败')
      setStartOpen(false)
      runningRef.current += 1
      await load()
      if (body.id) router.push(`/runs/${body.id}`)
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setStarting(false)
    }
  }

  const deleteTask = async (task: TaskRow) => {
    const ok = await confirm({
      title: '删除检测记录',
      description: `确认删除「${task.site?.name ?? `任务 #${task.id}`}」这次检测？全部结果与截图都会清除。`,
      confirmText: '删除'
    })
    if (!ok) return
    try {
      const res = await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? '删除失败')
      }
      if (tasks.length === 1 && page > 1) setPage((p) => p - 1)
      else await load()
    } catch (e) {
      setError(friendlyError(e))
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const canStart = sites.length > 0 && ruleSets.length > 0

  return (
    <div className="space-y-7">
      <PageHeader
        title="检测"
        description="选择站点与规则分组，使用真实浏览器执行检测。"
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={load} aria-label="刷新">
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button onClick={openStart} disabled={!canStart}>
              <Play className="h-4 w-4" /> 开始检测
            </Button>
          </>
        }
      />

      {error && <div className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger-soft-foreground">{error}</div>}

      {!canStart && (
        <Card className="px-4 py-3 text-sm text-foreground-muted">
          需要至少一个站点和一套规则。
          {sites.length === 0 && <Link href="/sites" className="ml-2 font-medium text-primary hover:underline">添加站点</Link>}
          {ruleSets.length === 0 && <Link href="/rules" className="ml-2 font-medium text-primary hover:underline">配置规则</Link>}
        </Card>
      )}

      {running > 0 && (
        <div className="flex items-center gap-2 text-sm text-foreground-muted">
          <Spinner className="h-3.5 w-3.5" /> {running} 个检测正在运行
        </div>
      )}

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <h2 className="text-sm font-semibold">检测记录</h2>
          <span className="text-xs text-foreground-subtle">共 {total} 次</span>
        </div>

        {loading ? (
          <Card className="flex justify-center py-16"><Spinner /></Card>
        ) : tasks.length === 0 ? (
          <Empty
            icon={<ShieldCheck className="h-7 w-7" />}
            title="还没有检测记录"
            description={canStart ? '点击「开始检测」选择站点和规则。' : '先添加站点并配置规则。'}
          />
        ) : (
          <Card className="divide-y divide-border overflow-hidden">
            {tasks.map((task) => {
              const progress = task.progress && !task.progress.queued
                ? Math.round((task.progress.done / Math.max(task.progress.total, 1)) * 100)
                : 0
              return (
                <div key={task.id} className="group grid gap-3 px-4 py-3.5 transition-colors hover:bg-black/[0.025] dark:hover:bg-white/[0.03] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <Link href={`/runs/${task.id}`} className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium">{task.site?.name ?? `站点 #${task.siteId}`}</span>
                      <StatusBadge status={task.status} />
                      <span className="text-xs text-foreground-subtle">{task.ruleSet?.name ?? `规则 #${task.ruleSetId}`}</span>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-foreground-subtle">{displayUrl(task.site?.url ?? '')}</div>
                    {task.status === 'running' && task.progress && (
                      <div className="mt-2 flex max-w-md items-center gap-2">
                        <div className="h-1 flex-1 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/10">
                          <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${progress}%` }} />
                        </div>
                        <span className="shrink-0 text-[11px] tabular-nums text-foreground-subtle">
                          {task.progress.queued ? '排队中' : `${task.progress.done}/${task.progress.total}`}
                        </span>
                      </div>
                    )}
                  </Link>
                  <div className="flex items-center justify-between gap-4 sm:justify-end">
                    <div className="text-xs text-foreground-muted">
                      {task.status === 'success' || task.status === 'failed' || task.status === 'stopped' ? (
                        <>
                          <span className="text-success">{task.passCount}</span>
                          <span className="mx-1 text-border-strong">/</span>
                          <span className="text-danger">{task.failCount}</span>
                        </>
                      ) : (
                        <span className="text-foreground-subtle">—</span>
                      )}
                      <span className="ml-3 tabular-nums text-foreground-subtle">{fmtTime(task.startedAt)}</span>
                    </div>
                    {task.status !== 'running' && (
                      <button
                        type="button"
                        onClick={() => deleteTask(task)}
                        aria-label={`删除 ${task.site?.name ?? `任务 #${task.id}`}`}
                        className="rounded p-1.5 text-foreground-subtle opacity-0 transition-opacity hover:bg-danger-soft hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </Card>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between gap-3 pt-1">
            <span className="text-xs text-foreground-subtle">第 {page} / {totalPages} 页</span>
            <div className="flex items-center gap-2">
              <Select
                value={String(pageSize)}
                onChange={(value) => { setPageSize(Number(value)); setPage(1) }}
                options={[10, 20, 50].map((n) => ({ value: String(n), label: `${n} / 页` }))}
                className="h-8 text-xs"
              />
              <Button variant="outline" size="sm" onClick={() => setPage((p) => p - 1)} disabled={page <= 1} aria-label="上一页">
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages} aria-label="下一页">
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </section>

      <Dialog
        open={startOpen}
        onClose={() => setStartOpen(false)}
        title="开始检测"
        footer={
          <>
            <Button variant="outline" onClick={() => setStartOpen(false)}>取消</Button>
            <Button onClick={startRun} disabled={starting || !siteId || !ruleSetId}>
              {starting && <Spinner />} 开始检测
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">站点</span>
            <Select
              value={siteId}
              onChange={setSiteId}
              options={sites.map((site) => ({ value: String(site.id), label: `${site.name} — ${displayUrl(site.url)}` }))}
              className="w-full"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">规则分组</span>
            <Select
              value={ruleSetId}
              onChange={setRuleSetId}
              options={ruleSets.map((set) => ({ value: String(set.id), label: `${set.name}（${set.ruleCount ?? 0} 条）` }))}
              className="w-full"
            />
          </label>
          <p className="text-xs leading-5 text-foreground-subtle">检测在后台运行，完成后可查看结果并生成报告。通常需要 30 秒到 2 分钟。</p>
        </div>
      </Dialog>
    </div>
  )
}
