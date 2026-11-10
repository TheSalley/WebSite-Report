'use client'

import * as React from 'react'
import Link from 'next/link'
import { ArrowRight, Activity, Globe, ListChecks, Play, ShieldCheck } from 'lucide-react'
import { Button, Card, Empty, PageHeader, StatusBadge } from '@/components/ui'
import type { RuleSet, Site } from '@/lib/types'
import type { TaskRow } from '@/lib/runs-view'
import { fmtTime } from '@/lib/runs-view'
import { displayUrl } from '@/lib/display'
import { fetchJson, friendlyError } from '@/lib/client-fetch'

type TaskListResponse = {
  items: TaskRow[]
  total: number
  running: number
}

export default function OverviewPage() {
  const [tasks, setTasks] = React.useState<TaskRow[]>([])
  const [sites, setSites] = React.useState<Site[]>([])
  const [ruleSets, setRuleSets] = React.useState<RuleSet[]>([])
  const [total, setTotal] = React.useState(0)
  const [running, setRunning] = React.useState(0)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')

  const load = React.useCallback(async () => {
    try {
      const [taskData, siteData, setData] = await Promise.all([
        fetchJson<TaskListResponse>('/api/tasks?page=1&pageSize=6'),
        fetchJson<Site[]>('/api/sites'),
        fetchJson<RuleSet[]>('/api/rulesets')
      ])
      setTasks(taskData.items)
      setTotal(taskData.total)
      setRunning(taskData.running)
      setSites(siteData)
      setRuleSets(setData)
      setError('')
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = async () => {
      await load()
      if (!stopped && running > 0) timer = setTimeout(tick, 4000)
    }
    void tick()
    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
    }
  }, [load, running])

  const ruleCount = ruleSets.reduce((sum, set) => sum + (set.ruleCount ?? 0), 0)
  const latest = tasks[0]

  return (
    <div className="space-y-8">
      <PageHeader
        title="概览"
        description="查看当前检测状态，或直接开始一次新的检测。"
        actions={
          <Link href="/runs">
            <Button>
              <Play className="h-4 w-4" /> 开始检测
            </Button>
          </Link>
        }
      />

      {error && <div className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger-soft-foreground">{error}</div>}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: '站点', value: sites.length, icon: Globe, href: '/sites' },
          { label: '检测记录', value: total, icon: Activity, href: '/runs' },
          { label: '正在运行', value: running, icon: ShieldCheck, href: '/runs' },
          { label: '启用规则', value: ruleCount, icon: ListChecks, href: '/rules' }
        ].map((item) => {
          const Icon = item.icon
          return (
            <Link key={item.label} href={item.href} className="panel rounded-xl px-4 py-4 transition-colors hover:border-border-strong">
              <div className="flex items-center justify-between text-xs text-foreground-muted">
                <span>{item.label}</span>
                <Icon className="h-4 w-4 text-foreground-subtle" />
              </div>
              <div className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">{loading ? '—' : item.value}</div>
            </Link>
          )
        })}
      </section>

      {!loading && (sites.length === 0 || ruleSets.length === 0) && (
        <Card className="p-5">
          <h2 className="text-sm font-semibold">开始前还需要准备</h2>
          <div className="mt-3 space-y-2 text-sm text-foreground-muted">
            {sites.length === 0 && (
              <p>
                先添加一个检测站点。<Link className="ml-1 font-medium text-primary hover:underline" href="/sites">去添加站点</Link>
              </p>
            )}
            {ruleSets.length === 0 && (
              <p>
                选择或新建一套检测规则。<Link className="ml-1 font-medium text-primary hover:underline" href="/rules">去配置规则</Link>
              </p>
            )}
          </div>
        </Card>
      )}

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">最近检测</h2>
            <p className="mt-0.5 text-xs text-foreground-muted">最近 6 条记录</p>
          </div>
          <Link href="/runs" className="inline-flex items-center gap-1 text-xs font-medium text-foreground-muted hover:text-foreground">
            查看全部 <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {loading ? (
          <Card className="p-8 text-center text-sm text-foreground-subtle">加载中…</Card>
        ) : tasks.length === 0 ? (
          <Empty
            icon={<ShieldCheck className="h-7 w-7" />}
            title="还没有检测记录"
            description="添加站点并选择规则后，从检测页开始第一次检测。"
          />
        ) : (
          <Card className="divide-y divide-border overflow-hidden">
            {tasks.map((task) => (
              <Link
                key={task.id}
                href={`/runs/${task.id}`}
                className="grid gap-3 px-4 py-3.5 transition-colors hover:bg-black/[0.025] dark:hover:bg-white/[0.03] sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium">{task.site?.name ?? `站点 #${task.siteId}`}</span>
                    <StatusBadge status={task.status} />
                  </div>
                  <div className="mt-0.5 truncate text-xs text-foreground-subtle">{displayUrl(task.site?.url ?? '')}</div>
                </div>
                <div className="text-xs text-foreground-muted">
                  <span className="text-success">{task.passCount} 通过</span>
                  <span className="mx-1.5 text-border-strong">/</span>
                  <span className="text-danger">{task.failCount} 失败</span>
                </div>
                <div className="text-xs tabular-nums text-foreground-subtle">{fmtTime(task.startedAt)}</div>
              </Link>
            ))}
          </Card>
        )}
      </section>

      {latest?.status === 'running' && latest.progress && (
        <Link href={`/runs/${latest.id}`} className="panel block rounded-xl px-4 py-3 text-sm transition-colors hover:border-border-strong">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium">正在检测 {latest.site?.name ?? `站点 #${latest.siteId}`}</span>
            <span className="text-xs text-foreground-muted">
              {latest.progress.queued ? '排队中' : `${latest.progress.done}/${latest.progress.total}`}
            </span>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/10">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500"
              style={{ width: `${Math.round((latest.progress.done / Math.max(latest.progress.total, 1)) * 100)}%` }}
            />
          </div>
        </Link>
      )}
    </div>
  )
}
