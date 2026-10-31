'use client'

import * as React from 'react'
import Link from 'next/link'
import { Play, Trash2, RefreshCw, ShieldCheck, FileText, X, BarChart3, Clock, ImageUp, Smartphone, Monitor, ScrollText, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button, Card, Dialog, Input, Select, Empty, Spinner, StatusBadge } from '@/components/ui'
import type { Task, Site, RuleSet, CheckResult } from '@/lib/types'
import { fetchJson, friendlyError } from '@/lib/client-fetch'

type TaskRow = Task & {
  progress: { done: number; total: number; ruleKey: string; ruleName: string; status: string; error?: string } | null
}

type TaskListResponse = {
  items: TaskRow[]
  total: number
  page: number
  pageSize: number
  running: number
}

const PAGE_SIZE_OPTIONS = [10, 20, 50]

export default function RunsPage() {
  const [tasks, setTasks] = React.useState<TaskRow[]>([])
  const [sites, setSites] = React.useState<Site[]>([])
  const [ruleSets, setRuleSets] = React.useState<RuleSet[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [startOpen, setStartOpen] = React.useState(false)
  const [siteId, setSiteId] = React.useState('')
  const [ruleSetId, setRuleSetId] = React.useState('')
  const [starting, setStarting] = React.useState(false)
  const [selectedTask, setSelectedTask] = React.useState<TaskRow | null>(null)
  const [results, setResults] = React.useState<CheckResult[]>([])
  const [resultsLoading, setResultsLoading] = React.useState(false)
  const [statusFilter, setStatusFilter] = React.useState('all')
  const [deliverableDrafts, setDeliverableDrafts] = React.useState<Record<number, string>>({})
  const [savingDeliverables, setSavingDeliverables] = React.useState(false)
  const [shotUploading, setShotUploading] = React.useState<'' | 'mobile' | 'desktop'>('')
  const [shotVersion, setShotVersion] = React.useState(0)
  const [taskLogs, setTaskLogs] = React.useState<string[]>([])
  const [logsOpen, setLogsOpen] = React.useState(false)
  const [cancelling, setCancelling] = React.useState<number | null>(null)
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(10)
  const [total, setTotal] = React.useState(0)
  const [runningCount, setRunningCount] = React.useState(0)
  const shotFileRef = React.useRef<HTMLInputElement | null>(null)
  const shotStrategyRef = React.useRef<'mobile' | 'desktop'>('mobile')

  const loadAll = React.useCallback(async () => {
    try {
      const [t, s, rs] = await Promise.all([
        fetchJson<TaskListResponse>(`/api/tasks?page=${page}&pageSize=${pageSize}`),
        fetchJson<Site[]>('/api/sites'),
        fetchJson<RuleSet[]>('/api/rulesets')
      ])
      setTasks(t.items)
      setTotal(t.total)
      setRunningCount(t.running)
      // 当前页超出总页数（如删除后）时回退到最后一页
      const totalPages = Math.max(1, Math.ceil(t.total / pageSize))
      if (page > totalPages && totalPages > 0) {
        setPage(totalPages)
        return
      }
      setSites(s)
      setRuleSets(rs)
      setError('')
    } catch (e) {
      setError(friendlyError(e))
      // 请求失败时不动已加载数据，仅提示
    } finally {
      setLoading(false)
    }
  }, [page, pageSize])

  React.useEffect(() => {
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = async () => {
      await loadAll()
      if (!stopped) timer = setTimeout(tick, 3000)
    }
    void tick()
    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
    }
  }, [loadAll])

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
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? '启动失败')
      setStartOpen(false)
      loadAll()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setStarting(false)
    }
  }

  const deleteTask = async (id: number) => {
    if (!confirm(`确认删除任务 #${id}？其全部检测结果与截图将被清除。`)) return
    await fetch(`/api/tasks/${id}`, { method: 'DELETE' })
    if (selectedTask?.id === id) setSelectedTask(null)
    // 当前页只剩一条时回到上一页，避免出现空页
    if (tasks.length === 1 && page > 1) setPage((p) => p - 1)
    else loadAll()
  }

  const cancelTask = async (id: number) => {
    if (!confirm(`确定终止任务 #${id} 吗？已完成的检测结果会被保留。`)) return
    setCancelling(id)
    try {
      await fetch(`/api/tasks/${id}/cancel`, { method: 'POST' })
      await loadAll()
    } catch {
      setError('终止请求失败，请重试')
    } finally {
      setCancelling(null)
    }
  }


  const loadTaskLogs = async (id: number) => {
    try {
      const data = await fetchJson<{ lines: string[] }>(`/api/tasks/${id}/log`)
      setTaskLogs(data.lines.slice(-200))
      setLogsOpen(true)
    } catch {
      setError('读取日志失败')
    }
  }

  const openTask = async (task: TaskRow) => {
    setSelectedTask(task)
    setResultsLoading(true)
    setResults([])
    try {
      const data = await fetch(`/api/tasks/${task.id}/results`).then((r) => r.json())
      setResults(data as CheckResult[])
    } finally {
      setResultsLoading(false)
    }
  }

  /** 静默刷新当前任务结果：不清空列表，避免页面高度抖动导致滚动跳顶 */
  const reloadResults = async () => {
    if (!selectedTask) return
    try {
      const data = await fetch(`/api/tasks/${selectedTask.id}/results`).then((r) => r.json())
      setResults(data as CheckResult[])
    } catch {
      // 刷新失败保留现有数据
    }
  }

  /** 批量保存所有已修改的交付成果 */
  const saveAllDeliverables = async () => {
    const ids = Object.keys(deliverableDrafts)
    if (ids.length === 0 || !selectedTask) return
    setSavingDeliverables(true)
    try {
      for (const id of ids) {
        const resultId = Number(id)
        await fetch(`/api/tasks/${selectedTask.id}/results/${resultId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deliverable: deliverableDrafts[resultId] ?? '' })
        })
      }
      setDeliverableDrafts({})
      await reloadResults()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSavingDeliverables(false)
    }
  }
  const hasDeliverableDrafts = Object.keys(deliverableDrafts).length > 0

  const updateStatus = async (resultId: number, status: string) => {
    if (!selectedTask) return
    await fetch(`/api/tasks/${selectedTask.id}/results/${resultId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    })
    await reloadResults()
    loadAll()
  }

  const openShotPicker = (strategy: 'mobile' | 'desktop') => {
    shotStrategyRef.current = strategy
    shotFileRef.current?.click()
  }

  const replaceShot = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !selectedTask) return
    const strategy = shotStrategyRef.current
    setShotUploading(strategy)
    try {
      const body = new FormData()
      body.append('strategy', strategy)
      body.append('file', file)
      const res = await fetch(`/api/tasks/${selectedTask.id}/pagespeed-shot`, { method: 'POST', body })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? '上传失败')
      // 截图已覆盖写入，自增版本号让图片 URL 带新参数，绕过浏览器强缓存
      setShotVersion((v) => v + 1)
      await loadAll()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setShotUploading('')
    }
  }

  const psShotUrl = (strategy: 'mobile' | 'desktop') =>
    selectedTask ? `/api/screenshots/task-${selectedTask.id}/pagespeed-${strategy}.png?v=${shotVersion}` : ''

  const reportUrl = selectedTask ? `/reports/${selectedTask.id}` : ''
  const filteredResults = results.filter((r) => statusFilter === 'all' || r.status === statusFilter)

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const statusCounts = (key: 'pass' | 'warn' | 'fail' | 'skip' | 'verify' | 'all') => results.filter((r) => r.status === key).length

  const fmtTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—')

  return (
    <div className="space-y-6">
      {/* 页头 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">检测与历史</h1>
          <p className="mt-0.5 text-sm text-foreground-muted">选择站点与规则集，一键开展合规性检测；后台真实浏览器执行。</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadAll}>
            <RefreshCw className="h-3.5 w-3.5" /> 刷新
          </Button>
          <Button onClick={openStart} disabled={sites.length === 0 || ruleSets.length === 0}>
            <Play className="h-4 w-4" /> 开始检测
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger-soft-foreground">{error}</div>
      )}

      {runningCount > 0 && (
        <div className="flex items-center gap-2.5 rounded-md bg-primary-soft px-4 py-2.5 text-sm text-primary-soft-foreground">
          <Spinner /> {runningCount} 个任务正在后台运行…
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : tasks.length === 0 ? (
        <Empty
          icon={<ShieldCheck className="h-8 w-8" />}
          title="还没有检测任务"
          description="先在「站点管理」添加站点，然后点击右上角「开始检测」。"
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <BarChart3 className="h-4 w-4 text-primary" /> 任务列表
            </div>
            <span className="text-xs text-foreground-subtle">共 {total} 个</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border/60 bg-white/40 text-xs text-foreground-muted backdrop-blur-sm dark:bg-white/[0.04]">
                  <th className="px-4 py-3 font-medium">ID</th>
                  <th className="px-4 py-3 font-medium">站点</th>
                  <th className="px-4 py-3 font-medium">规则集</th>
                  <th className="px-4 py-3 font-medium">状态</th>
                  <th className="px-4 py-3 font-medium">通过/失败</th>
                  <th className="px-4 py-3 font-medium">时间</th>
                  <th className="px-4 py-3 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => openTask(t)}
                    className="cursor-pointer border-b border-border/60 transition-colors hover:bg-white/55 dark:hover:bg-white/[0.05]"
                  >
                    <td className="px-4 py-3.5 font-mono text-xs text-foreground-subtle">#{t.id}</td>
                    <td className="px-4 py-3.5">
                      <div className="font-medium">{t.site?.name ?? `站点#${t.siteId}`}</div>
                      <div className="max-w-[200px] truncate text-xs text-foreground-subtle">{t.site?.url}</div>
                    </td>
                    <td className="px-4 py-3.5 text-foreground-muted">{t.ruleSet?.name ?? `规则集#${t.ruleSetId}`}</td>
                    <td className="px-4 py-3.5">
                      {t.status === 'running' && t.progress ? (
                        <div className="space-y-1.5">
                          <StatusBadge status={t.status} />
                          <div className="text-[11px] text-foreground-subtle">
                            {t.progress.done}/{t.progress.total} · {t.progress.ruleName}
                          </div>
                          <div className="h-1.5 w-28 overflow-hidden rounded-full bg-white/60 shadow-inner dark:bg-white/10">
                            <div
                              className="h-full rounded-full bg-primary transition-all duration-500"
                              style={{ width: `${Math.round((t.progress.done / Math.max(t.progress.total, 1)) * 100)}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <StatusBadge status={t.status} />
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-xs">
                      <span className="font-medium text-success">{t.passCount}</span>
                      <span className="mx-1 text-foreground-subtle">/</span>
                      <span className="font-medium text-danger">{t.failCount}</span>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-foreground-subtle">{fmtTime(t.startedAt)}</td>
                    <td className="px-4 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        {t.status === 'running' && (
                          <Button variant="ghost" size="sm" onClick={() => cancelTask(t.id)} disabled={cancelling === t.id}>
                            {cancelling === t.id ? <Spinner /> : <X className="h-3.5 w-3.5" />}
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => deleteTask(t.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3">
            <span className="text-xs text-foreground-subtle">
              第 {page}/{totalPages} 页 · 共 {total} 个任务
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-foreground-subtle">每页</span>
              <Select
                value={String(pageSize)}
                onChange={(v) => {
                  setPageSize(Number(v))
                  setPage(1)
                }}
                options={PAGE_SIZE_OPTIONS.map((n) => ({ value: String(n), label: String(n) }))}
                className="h-8 w-[72px] text-xs"
              />
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-3.5 w-3.5" /> 上一页
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                下一页 <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* 开始检测对话框 */}
      <Dialog
        open={startOpen}
        onClose={() => setStartOpen(false)}
        title="开始检测"
        footer={
          <>
            <Button variant="outline" onClick={() => setStartOpen(false)}>取消</Button>
            <Button onClick={startRun} disabled={starting || !siteId || !ruleSetId}>
              {starting && <Spinner />} 开始
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">检测站点</label>
            <Select
              value={siteId}
              onChange={setSiteId}
              options={sites.map((s) => ({ value: String(s.id), label: `${s.name}（${s.url}）` }))}
              className="w-full"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">规则集</label>
            <Select
              value={ruleSetId}
              onChange={setRuleSetId}
              options={ruleSets.map((rs) => ({ value: String(rs.id), label: `${rs.name}（${rs.ruleCount ?? 0} 条规则）` }))}
              className="w-full"
            />
          </div>
          <p className="flex items-center gap-1.5 text-xs text-foreground-subtle">
            <Clock className="h-3.5 w-3.5" /> 检测在服务器后台执行，使用真实浏览器渲染；耗时约 30 秒~2 分钟。
          </p>
        </div>
      </Dialog>

      {/* 任务详情弹窗 */}
      <input
        ref={shotFileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={replaceShot}
      />
      {selectedTask && (
        <Dialog
          open
          onClose={() => setSelectedTask(null)}
          title={`任务 #${selectedTask.id}${selectedTask.site?.name ? ' · ' + selectedTask.site.name : ''}`}
          width="max-w-4xl"
          actions={
            <>
              {selectedTask.status === 'success' && (
                <Link href={reportUrl} target="_blank">
                  <Button variant="outline" size="sm">
                    <FileText className="h-3.5 w-3.5" /> 查看报告
                  </Button>
                </Link>
              )}
              {selectedTask.status === 'running' && (
                <Button variant="outline" size="sm" onClick={() => cancelTask(selectedTask.id)} disabled={cancelling === selectedTask.id}>
                  {cancelling === selectedTask.id ? <Spinner /> : <X className="h-3.5 w-3.5" />} 终止任务
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => loadTaskLogs(selectedTask.id)}>
                <ScrollText className="h-3.5 w-3.5" /> 查看日志
              </Button>
              {hasDeliverableDrafts && (
                <Button size="sm" onClick={() => saveAllDeliverables()} disabled={savingDeliverables}>
                  {savingDeliverables && <Spinner />} 保存修改
                </Button>
              )}
            </>
          }
        >
          <div className="flex flex-wrap items-center gap-2 pb-2 text-xs text-foreground-subtle">
            <StatusBadge status={selectedTask.status} />
            <span className="text-foreground-muted">{selectedTask.site?.url}</span>
            <span>·</span>
            <span>{selectedTask.ruleSet?.name}</span>
          </div>
          <div className="mb-4 h-px bg-border" />

          <div>
            {/* 概览条 */}
            {!resultsLoading && results.length > 0 && (
              <div className="glass mb-5 flex flex-wrap items-center gap-6 rounded-2xl p-4">
                <div className="grid flex-1 grid-cols-2 gap-x-8 gap-y-2 sm:grid-cols-4">
                  <div>
                    <div className="text-xs text-foreground-subtle">通过</div>
                    <div className="text-lg font-bold text-success">{statusCounts('pass')}</div>
                  </div>
                  <div>
                    <div className="text-xs text-foreground-subtle">失败</div>
                    <div className="text-lg font-bold text-danger">{statusCounts('fail')}</div>
                  </div>
                  <div>
                    <div className="text-xs text-foreground-subtle">跳过</div>
                    <div className="text-lg font-bold text-foreground-muted">{statusCounts('skip')}</div>
                  </div>
                  <div>
                    <div className="text-xs text-foreground-subtle">待验收</div>
                    <div className="text-lg font-bold text-primary">{statusCounts('verify')}</div>
                  </div>
                </div>
              </div>
            )}

            {resultsLoading ? (
              <div className="flex justify-center py-8"><Spinner /></div>
            ) : results.length === 0 ? (
              <div className="py-8 text-center text-sm">
                {selectedTask.status === 'failed' ? (
                  <div className="mx-auto max-w-lg">
                    <div className="mb-1.5 font-medium text-danger">检测失败</div>
                    <div className="break-all rounded-md bg-danger-soft px-4 py-2.5 text-left text-xs text-danger-soft-foreground">
                      {selectedTask.error || '未知错误（可能是浏览器环境问题，请检查服务器 Chromium 是否已安装）'}
                    </div>
                  </div>
                ) : (
                  <span className="text-foreground-subtle">该任务暂无检测结果（可能页面加载失败或未完成）</span>
                )}
              </div>
            ) : (
              <>
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  {(['all', 'pass', 'fail', 'skip', 'verify'] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setStatusFilter(s)}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                        statusFilter === s
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'bg-zinc-100 text-foreground-muted hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700'
                      }`}
                    >
                      {s === 'all' ? '全部' : { pass: '通过', fail: '失败', skip: '跳过', verify: '待验收' }[s]}
                      <span className="ml-1 opacity-70">{statusCounts(s)}</span>
                    </button>
                  ))}
                </div>

                {/* PageSpeed 截图（支持替换） */}
                <div className="mb-4 grid gap-3 lg:grid-cols-2">
                  {(['mobile', 'desktop'] as const).map((strategy) => (
                    <div
                      key={strategy}
                      className="overflow-hidden rounded-xl border border-border/60 bg-white/55 shadow-sm shadow-black/[0.04] transition-shadow hover:shadow-md dark:bg-white/[0.05]"
                    >
                      <div className="flex items-center gap-3 border-b border-border/60 bg-white/40 px-4 py-2.5 dark:bg-white/[0.04]">
                        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary-soft text-primary">
                          {strategy === 'mobile' ? <Smartphone className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}
                        </span>
                        <span className="text-sm font-medium">PageSpeed {strategy === 'mobile' ? '移动端' : '桌面端'} 截图</span>
                        <span className="ml-auto flex items-center gap-2">
                          <button
                            className="inline-flex items-center gap-1 text-xs font-medium text-foreground-muted hover:text-foreground"
                            onClick={() => openShotPicker(strategy)}
                            disabled={shotUploading !== ''}
                          >
                            <ImageUp className="h-3.5 w-3.5" />
                            {shotUploading === strategy ? '上传中…' : '替换截图'}
                          </button>
                        </span>
                      </div>
                      <div className="p-3">
                        <img
                          src={psShotUrl(strategy)}
                          alt={`PageSpeed ${strategy === 'mobile' ? '移动端' : '桌面端'} 截图`}
                          className="max-h-64 w-full cursor-zoom-in rounded-md border border-border object-contain"
                          onClick={() => window.open(psShotUrl(strategy), '_blank')}
                          onError={(e) => {
                            ;(e.target as HTMLImageElement).style.display = 'none'
                          }}
                          loading="lazy"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid gap-3 lg:grid-cols-2">
                  {filteredResults.map((r) => (
                    <div key={r.id} className="glass rounded-xl p-4 transition-shadow hover:shadow-md">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <StatusBadge status={r.status} />
                            <span className="text-xs text-foreground-subtle">{r.groupName}</span>
                            <Select
                              value={r.status}
                              onChange={(v) => updateStatus(r.id, v)}
                              className="h-7 w-[104px] text-xs"
                              options={[
                                { value: 'pass', label: '通过' },
                                { value: 'fail', label: '失败' },
                                { value: 'skip', label: '跳过' },
                                { value: 'verify', label: '待验收' }
                              ]}
                            />
                          </div>
                          <div className="mt-1.5 text-sm font-medium">{r.ruleName}</div>
                        </div>
                      </div>
                      <dl className="mt-2.5 space-y-1 text-xs">
                        <div className="flex gap-2">
                          <dt className="w-12 shrink-0 text-foreground-subtle">实际值</dt>
                          <dd className="min-w-0 break-all text-foreground-muted">{r.actualValue || '—'}</dd>
                        </div>
                        <div className="flex gap-2">
                          <dt className="w-12 shrink-0 text-foreground-subtle">说明</dt>
                          <dd className="min-w-0 break-all">{r.description}</dd>
                        </div>
                      </dl>
                      {(r.deliverable || selectedTask.status === 'success') && (
                        <div className="mt-3">
                          <Input
                            placeholder="自定义交付成果（留空则沿用预设文案）…"
                            value={deliverableDrafts[r.id] ?? r.deliverable ?? ''}
                            onChange={(e) => setDeliverableDrafts((d) => ({ ...d, [r.id]: e.target.value }))}
                            className="h-8 w-full text-xs"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </Dialog>
      )}

      {/* 任务日志弹窗 */}
      <Dialog
        open={logsOpen}
        onClose={() => setLogsOpen(false)}
        title={"任务日志" + (selectedTask ? ` #${selectedTask.id}` : '')}
        width="max-w-2xl"
        footer={<Button variant="outline" onClick={() => setLogsOpen(false)}>关闭</Button>}
      >
        <div className="max-h-[420px] space-y-1 overflow-y-auto rounded-md bg-zinc-950 p-3 font-mono text-[11px] leading-relaxed text-zinc-100 dark:bg-black/60">
          {taskLogs.length === 0 ? (
            <div className="py-6 text-center text-zinc-400">暂无日志（任务可能尚未产生日志，或日志文件不存在）</div>
          ) : (
            taskLogs.map((line, idx) => (
              <div key={idx} className="whitespace-pre-wrap break-all">{line}</div>
            ))
          )}
        </div>
      </Dialog>
    </div>
  )
}

