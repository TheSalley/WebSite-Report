'use client'

import * as React from 'react'
import Link from 'next/link'
import { Play, Trash2, RefreshCw, ShieldCheck, FileText, X, BarChart3, Clock } from 'lucide-react'
import { Button, Card, Dialog, Input, Select, Empty, Spinner, StatusBadge, Badge, ScoreRing } from '@/components/ui'
import type { Task, Site, RuleSet, CheckResult } from '@/lib/types'

type TaskRow = Task & {
  progress: { done: number; total: number; ruleKey: string; ruleName: string; status: string; error?: string } | null
}

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
  const [noteDrafts, setNoteDrafts] = React.useState<Record<number, string>>({})

  const loadAll = React.useCallback(async () => {
    try {
      const [t, s, rs] = await Promise.all([
        fetch('/api/tasks').then((r) => r.json()),
        fetch('/api/sites').then((r) => r.json()),
        fetch('/api/rulesets').then((r) => r.json())
      ])
      setTasks(t)
      setSites(s)
      setRuleSets(rs)
      setError('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    loadAll()
    const timer = setInterval(loadAll, 2000)
    return () => clearInterval(timer)
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
    loadAll()
  }

  const cancelTask = async (id: number) => {
    await fetch(`/api/tasks/${id}/cancel`, { method: 'POST' })
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

  const saveNote = async (resultId: number) => {
    const note = noteDrafts[resultId] ?? ''
    await fetch(`/api/tasks/${selectedTask?.id}/results/${resultId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note })
    })
    setNoteDrafts((d) => ({ ...d, [resultId]: '' }))
    if (selectedTask) openTask(selectedTask)
  }

  const updateStatus = async (resultId: number, status: string) => {
    if (!selectedTask) return
    await fetch(`/api/tasks/${selectedTask.id}/results/${resultId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    })
    await openTask(selectedTask)
    loadAll()
  }

  const reportUrl = selectedTask ? `/reports/${selectedTask.id}` : ''
  const filteredResults = results.filter((r) => statusFilter === 'all' || r.status === statusFilter)

  const runningCount = tasks.filter((t) => t.status === 'running').length

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
            <span className="text-xs text-foreground-subtle">共 {tasks.length} 个</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-zinc-50/60 text-xs text-foreground-muted dark:bg-zinc-800/30">
                  <th className="px-4 py-3 font-medium">ID</th>
                  <th className="px-4 py-3 font-medium">站点</th>
                  <th className="px-4 py-3 font-medium">规则集</th>
                  <th className="px-4 py-3 font-medium">状态</th>
                  <th className="px-4 py-3 font-medium">得分</th>
                  <th className="px-4 py-3 font-medium">通过/警告/失败</th>
                  <th className="px-4 py-3 font-medium">时间</th>
                  <th className="px-4 py-3 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => openTask(t)}
                    className="cursor-pointer border-b border-border/70 transition-colors hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40"
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
                          <div className="h-1.5 w-28 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
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
                    <td className="px-4 py-3.5">
                      {t.score !== null ? (
                        <span className={`font-mono text-base font-bold ${t.score >= 90 ? 'text-success' : t.score >= 70 ? 'text-warning' : 'text-danger'}`}>
                          {t.score}
                        </span>
                      ) : (
                        <span className="text-foreground-subtle">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-xs">
                      <span className="font-medium text-success">{t.passCount}</span>
                      <span className="mx-1 text-foreground-subtle">/</span>
                      <span className="font-medium text-warning">{t.warnCount}</span>
                      <span className="mx-1 text-foreground-subtle">/</span>
                      <span className="font-medium text-danger">{t.failCount}</span>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-foreground-subtle">{fmtTime(t.startedAt)}</td>
                    <td className="px-4 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        {t.status === 'running' && (
                          <Button variant="ghost" size="sm" onClick={() => cancelTask(t.id)}>
                            <X className="h-3.5 w-3.5" />
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

      {/* 任务详情 */}
      {selectedTask && (
        <Card className="mt-6 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-zinc-50/50 px-5 py-4 dark:bg-zinc-800/20">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold">任务 #{selectedTask.id} · {selectedTask.site?.name}</h2>
                <StatusBadge status={selectedTask.status} />
              </div>
              <div className="text-xs text-foreground-subtle">
                {selectedTask.site?.url} · {selectedTask.ruleSet?.name}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {selectedTask.status === 'success' && (
                <Link href={reportUrl} target="_blank">
                  <Button variant="outline" size="sm">
                    <FileText className="h-3.5 w-3.5" /> 查看报告
                  </Button>
                </Link>
              )}
              <Button variant="ghost" size="sm" onClick={() => setSelectedTask(null)}>
                关闭
              </Button>
            </div>
          </div>

          <div className="px-5 py-4">
            {/* 概览条 */}
            {!resultsLoading && results.length > 0 && (
              <div className="mb-5 flex flex-wrap items-center gap-6 rounded-xl border border-border bg-background p-4">
                <ScoreRing score={selectedTask.score ?? 0} />
                <div className="grid flex-1 grid-cols-2 gap-x-8 gap-y-2 sm:grid-cols-4">
                  <div>
                    <div className="text-xs text-foreground-subtle">通过</div>
                    <div className="text-lg font-bold text-success">{statusCounts('pass')}</div>
                  </div>
                  <div>
                    <div className="text-xs text-foreground-subtle">警告</div>
                    <div className="text-lg font-bold text-warning">{statusCounts('warn')}</div>
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
              <div className="py-8 text-center text-sm text-foreground-subtle">该任务暂无检测结果（可能页面加载失败或未完成）</div>
            ) : (
              <>
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  {(['all', 'pass', 'warn', 'fail', 'skip', 'verify'] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setStatusFilter(s)}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                        statusFilter === s
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'bg-zinc-100 text-foreground-muted hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700'
                      }`}
                    >
                      {s === 'all' ? '全部' : { pass: '通过', warn: '警告', fail: '失败', skip: '跳过', verify: '待验收' }[s]}
                      <span className="ml-1 opacity-70">{statusCounts(s)}</span>
                    </button>
                  ))}
                </div>

                <div className="grid gap-3 lg:grid-cols-2">
                  {filteredResults.map((r) => (
                    <div key={r.id} className="rounded-lg border border-border bg-background p-4 transition-shadow hover:shadow-sm">
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
                                { value: 'warn', label: '警告' },
                                { value: 'fail', label: '失败' },
                                { value: 'skip', label: '跳过' },
                                { value: 'verify', label: '待验收' }
                              ]}
                            />
                          </div>
                          <div className="mt-1.5 text-sm font-medium">{r.ruleName}</div>
                        </div>
                        <Badge color={r.severity === 'critical' ? 'red' : r.severity === 'warning' ? 'amber' : 'gray'}>
                          {r.severity === 'critical' ? '必须' : r.severity === 'warning' ? '警告' : '建议'}
                        </Badge>
                      </div>
                      <dl className="mt-2.5 space-y-1 text-xs">
                        <div className="flex gap-2">
                          <dt className="w-12 shrink-0 text-foreground-subtle">实际值</dt>
                          <dd className="min-w-0 break-all text-foreground-muted">{r.actualValue || '—'}</dd>
                        </div>
                        <div className="flex gap-2">
                          <dt className="w-12 shrink-0 text-foreground-subtle">期望值</dt>
                          <dd className="min-w-0 break-all text-foreground-muted">{r.expectedValue || '—'}</dd>
                        </div>
                        <div className="flex gap-2">
                          <dt className="w-12 shrink-0 text-foreground-subtle">说明</dt>
                          <dd className="min-w-0 break-all">{r.description}</dd>
                        </div>
                      </dl>
                      {r.screenshotPath && (
                        <img
                          src={`/api/screenshots/${r.screenshotPath}`}
                          alt={`${r.ruleName} 截图证据`}
                          className="mt-3 w-full rounded-md border border-border"
                          loading="lazy"
                        />
                      )}
                      {(r.note || selectedTask.status === 'success') && (
                        <div className="mt-3 flex gap-2">
                          <Input
                            placeholder="人工复核备注…"
                            value={noteDrafts[r.id] ?? r.note}
                            onChange={(e) => setNoteDrafts((d) => ({ ...d, [r.id]: e.target.value }))}
                            className="h-8 text-xs"
                          />
                          <Button size="sm" variant="outline" onClick={() => saveNote(r.id)}>
                            保存
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </Card>
      )}
    </div>
  )
}

