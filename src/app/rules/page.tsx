'use client'

import * as React from 'react'
import { Copy, ListChecks, Plus, Save, Search, Settings2, Trash2 } from 'lucide-react'
import { Button, Card, Dialog, Empty, Input, Label, Switch, Textarea } from '@/components/ui'
import type { Rule, RuleSet } from '@/lib/types'
import { fetchJson, friendlyError } from '@/lib/client-fetch'

type DraftRule = Omit<Rule, 'id'> & { id?: number }

type CatalogRule = {
  groupName: string
  ruleKey: string
  name: string
  description?: string
  deliverable?: string
  scope?: 'page' | 'site'
  params: Record<string, unknown>
}

type GroupForm = {
  name: string
  description: string
  scanPages: boolean
}

const EMPTY_FORM: GroupForm = { name: '', description: '', scanPages: false }

function formOf(rs: RuleSet): GroupForm {
  return { name: rs.name, description: rs.description, scanPages: rs.scanPages }
}

function draftOf(item: CatalogRule, ruleSetId: number, sortOrder: number): DraftRule {
  return {
    ruleSetId,
    groupName: item.groupName,
    ruleKey: item.ruleKey,
    name: item.name,
    enabled: true,
    description: item.description,
    deliverable: item.deliverable,
    scope: item.scope ?? 'page',
    params: item.params ?? {},
    sortOrder
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error((body as { error?: string } | null)?.error ?? '请求失败')
  return body as T
}

export default function RulesPage() {
  const [ruleSets, setRuleSets] = React.useState<RuleSet[]>([])
  const [catalog, setCatalog] = React.useState<CatalogRule[]>([])
  const [selectedId, setSelectedId] = React.useState<number | null>(null)
  const [rules, setRules] = React.useState<DraftRule[]>([])
  const [form, setForm] = React.useState<GroupForm>(EMPTY_FORM)
  const [query, setQuery] = React.useState('')
  const [configKey, setConfigKey] = React.useState<string | null>(null)
  const [dirty, setDirty] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [createOpen, setCreateOpen] = React.useState(false)
  const [newName, setNewName] = React.useState('')
  const [newDesc, setNewDesc] = React.useState('')

  const selectedSet = ruleSets.find((rs) => rs.id === selectedId) ?? null
  const configRule = configKey ? rules.find((r) => r.ruleKey === configKey) ?? null : null

  React.useEffect(() => {
    ;(async () => {
      try {
        const [sets, items] = await Promise.all([
          fetchJson<RuleSet[]>('/api/rulesets'),
          fetchJson<CatalogRule[]>('/api/rulesets/catalog')
        ])
        setRuleSets(sets)
        setCatalog(items)
        if (sets.length > 0) {
          setSelectedId(sets[0].id)
          setForm(formOf(sets[0]))
          setRules(await fetchJson<DraftRule[]>(`/api/rulesets/${sets[0].id}/rules`))
        }
      } catch (e) {
        setError(friendlyError(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const refreshSets = async (): Promise<RuleSet[]> => {
    const data = await fetchJson<RuleSet[]>('/api/rulesets')
    setRuleSets(data)
    return data
  }

  const selectSet = async (rs: RuleSet) => {
    if (rs.id === selectedId) return
    if (dirty && !confirm('当前分组有未保存的修改，切换会丢失。继续？')) return
    try {
      setSelectedId(rs.id)
      setForm(formOf(rs))
      setConfigKey(null)
      setRules(await fetchJson<DraftRule[]>(`/api/rulesets/${rs.id}/rules`))
      setDirty(false)
      setError('')
    } catch (e) {
      setError(friendlyError(e))
    }
  }

  const createGroup = async () => {
    if (!newName.trim()) return
    try {
      const created = await request<RuleSet>('/api/rulesets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), description: newDesc })
      })
      await refreshSets()
      setCreateOpen(false)
      setNewName('')
      setNewDesc('')
      setSelectedId(created.id)
      setForm(formOf(created))
      setRules([])
      setDirty(false)
      setConfigKey(null)
      setError('')
    } catch (e) {
      setError(friendlyError(e))
    }
  }

  const duplicateSet = async (rs: RuleSet) => {
    if (dirty && !confirm('当前分组有未保存的修改，复制并切换会丢失。继续？')) return
    try {
      const dup = await request<RuleSet>(`/api/rulesets/${rs.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duplicate: true, name: `${rs.name} 副本` })
      })
      await refreshSets()
      setSelectedId(dup.id)
      setForm(formOf(dup))
      setRules(await fetchJson<DraftRule[]>(`/api/rulesets/${dup.id}/rules`))
      setDirty(false)
      setConfigKey(null)
      setError('')
    } catch (e) {
      setError(friendlyError(e))
    }
  }

  const deleteSet = async (rs: RuleSet) => {
    if (!confirm(`确认删除分组「${rs.name}」？分组内的规则选择会一并删除，历史检测记录不受影响。`)) return
    try {
      await request(`/api/rulesets/${rs.id}`, { method: 'DELETE' })
      const list = await refreshSets()
      if (selectedId === rs.id) {
        const next = list[0] ?? null
        if (next) {
          setSelectedId(next.id)
          setForm(formOf(next))
          setRules(await fetchJson<DraftRule[]>(`/api/rulesets/${next.id}/rules`))
        } else {
          setSelectedId(null)
          setForm(EMPTY_FORM)
          setRules([])
        }
        setDirty(false)
        setConfigKey(null)
      }
      setError('')
    } catch (e) {
      setError(friendlyError(e))
    }
  }

  const toggleRule = (item: CatalogRule, checked: boolean) => {
    setDirty(true)
    setRules((prev) => {
      if (!checked) return prev.filter((r) => r.ruleKey !== item.ruleKey)
      if (prev.some((r) => r.ruleKey === item.ruleKey)) return prev
      return [...prev, draftOf(item, selectedId ?? 0, prev.length + 1)]
    })
  }

  const toggleCategory = (items: CatalogRule[], checked: boolean) => {
    setDirty(true)
    setRules((prev) => {
      if (!checked) {
        const drop = new Set(items.map((i) => i.ruleKey))
        return prev.filter((r) => !drop.has(r.ruleKey))
      }
      const keys = new Set(prev.map((r) => r.ruleKey))
      const next = [...prev]
      for (const item of items) {
        if (keys.has(item.ruleKey)) continue
        keys.add(item.ruleKey)
        next.push(draftOf(item, selectedId ?? 0, next.length + 1))
      }
      return next
    })
  }

  const patchRule = (ruleKey: string, patch: Partial<DraftRule>) => {
    setRules((prev) => prev.map((r) => (r.ruleKey === ruleKey ? { ...r, ...patch } : r)))
    setDirty(true)
  }

  const save = async () => {
    if (selectedId === null || !form.name.trim()) return
    setSaving(true)
    try {
      await request(`/api/rulesets/${selectedId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, name: form.name.trim() })
      })
      await request(`/api/rulesets/${selectedId}/rules`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rules.map(({ id, ...rest }) => rest))
      })
      setDirty(false)
      await refreshSets()
      setError('')
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setSaving(false)
    }
  }

  const visibleGroups = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    const map = new Map<string, CatalogRule[]>()
    for (const item of catalog) {
      if (q && !`${item.name} ${item.ruleKey} ${item.groupName}`.toLowerCase().includes(q)) continue
      const arr = map.get(item.groupName) ?? []
      arr.push(item)
      map.set(item.groupName, arr)
    }
    return Array.from(map.entries())
  }, [catalog, query])

  const selectedKeys = React.useMemo(() => new Set(rules.map((r) => r.ruleKey)), [rules])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">规则分组</h1>
          <p className="mt-0.5 text-sm text-foreground-muted">从规则库勾选规则组成检测分组；每个分组独立保存规则选择与参数。</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> 新建分组
        </Button>
      </div>

      {error && <div className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger-soft-foreground">{error}</div>}

      {loading ? (
        <div className="flex justify-center py-16"><span className="text-sm text-foreground-subtle">加载中…</span></div>
      ) : ruleSets.length === 0 ? (
        <Empty icon={<ListChecks className="h-8 w-8" />} title="还没有规则分组" description="点击「新建分组」，然后从规则库中勾选需要的规则。" />
      ) : (
        <div className="grid gap-4 md:grid-cols-[260px_1fr]">
          <Card className="h-fit overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="text-sm font-medium">我的分组</span>
              <span className="text-xs text-foreground-subtle">{ruleSets.length} 个</span>
            </div>
            <nav className="divide-y divide-border/70">
              {ruleSets.map((rs) => {
                const active = selectedId === rs.id
                return (
                  <div
                    key={rs.id}
                    className={`group flex items-center gap-1 px-3 py-2.5 text-sm transition-colors ${
                      active ? 'bg-primary-soft/70 backdrop-blur-sm' : 'hover:bg-white/55 dark:hover:bg-white/[0.05]'
                    }`}
                  >
                    <button className="min-w-0 flex-1 text-left" onClick={() => selectSet(rs)}>
                      <span className={`block truncate font-medium ${active ? 'text-primary-soft-foreground' : ''}`}>{rs.name}</span>
                      <span className="mt-0.5 block text-[11px] text-foreground-subtle">
                        {rs.ruleCount ?? 0} 条规则{rs.isBuiltin ? ' · 默认' : ''}
                      </span>
                    </button>
                    <div className="flex shrink-0 gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                      <Button variant="ghost" size="sm" onClick={() => duplicateSet(rs)} title="复制分组">
                        <Copy className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => deleteSet(rs)} title="删除分组">
                        <Trash2 className="h-3 w-3 text-danger" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </nav>
          </Card>

          {selectedSet && (
            <Card className="overflow-hidden">
              <div className="space-y-3 border-b border-border/60 bg-white/40 px-5 py-4 dark:bg-white/[0.04]">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="space-y-1.5">
                      <Label>分组名称</Label>
                      <Input
                        value={form.name}
                        onChange={(e) => {
                          setForm((f) => ({ ...f, name: e.target.value }))
                          setDirty(true)
                        }}
                        placeholder="例如：上线前全面检查"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>说明</Label>
                      <Textarea
                        rows={2}
                        value={form.description}
                        onChange={(e) => {
                          setForm((f) => ({ ...f, description: e.target.value }))
                          setDirty(true)
                        }}
                        placeholder="这个分组用于什么场景（可选）"
                      />
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2 pt-6">
                    <Button variant="outline" size="sm" onClick={() => duplicateSet(selectedSet)}>
                      <Copy className="h-3.5 w-3.5" /> 复制
                    </Button>
                    <Button size="sm" onClick={save} disabled={!dirty || saving || !form.name.trim()}>
                      <Save className="h-3.5 w-3.5" /> {saving ? '保存中…' : dirty ? '保存' : '已保存'}
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-foreground-subtle">
                  <span>已勾选 <b className="text-foreground">{rules.length}</b> 条 · 规则库共 {catalog.length} 条</span>
                  <label className="flex items-center gap-2 text-foreground-muted">
                    <Switch
                      checked={form.scanPages}
                      onCheckedChange={(v) => {
                        setForm((f) => ({ ...f, scanPages: v }))
                        setDirty(true)
                      }}
                    />
                    多页面模板检查
                  </label>
                  <span>按 sitemap 枚举并去重，模板页只检测代表页</span>
                </div>
              </div>

              <div className="p-5">
                <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold">规则库</h2>
                    <p className="mt-0.5 text-xs text-foreground-subtle">勾选需要执行的规则；点右侧齿轮可单独调整说明、交付文案与默认通过。</p>
                  </div>
                  <div className="relative w-full sm:w-64">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground-subtle" />
                    <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索规则名称或 key" className="pl-8" />
                  </div>
                </div>

                {visibleGroups.length === 0 ? (
                  <Empty icon={<Search className="h-8 w-8" />} title="没有匹配的规则" description="换个关键词试试。" />
                ) : (
                  <div className="space-y-3">
                    {visibleGroups.map(([groupName, items]) => {
                      const selectedCount = items.filter((i) => selectedKeys.has(i.ruleKey)).length
                      const allSelected = selectedCount === items.length
                      return (
                        <div key={groupName} className="overflow-hidden rounded-xl border border-border/60">
                          <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-white/45 px-3.5 py-2 dark:bg-white/[0.05]">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">{groupName}</span>
                              <span className="text-xs text-foreground-subtle">{selectedCount}/{items.length}</span>
                            </div>
                            <button
                              type="button"
                              className="text-xs font-medium text-primary hover:underline"
                              onClick={() => toggleCategory(items, !allSelected)}
                            >
                              {allSelected ? '清空该组' : '全选该组'}
                            </button>
                          </div>
                          <div className="divide-y divide-border/70">
                            {items.map((item) => {
                              const selected = selectedKeys.has(item.ruleKey)
                              const current = rules.find((r) => r.ruleKey === item.ruleKey)
                              return (
                                <label
                                  key={item.ruleKey}
                                  className={`flex cursor-pointer items-start gap-3 px-3.5 py-3 transition-colors ${selected ? 'bg-primary-soft/25' : 'hover:bg-white/50 dark:hover:bg-white/[0.04]'}`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={selected}
                                    onChange={(e) => toggleRule(item, e.target.checked)}
                                    className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-primary"
                                  />
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="text-sm font-medium">{item.name}</span>
                                      {item.scope === 'site' && (
                                        <span className="rounded bg-primary-soft px-1.5 py-0.5 text-[10px] font-medium text-primary-soft-foreground">站点级</span>
                                      )}
                                      {current?.params?.defaultPass === true && (
                                        <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">默认通过</span>
                                      )}
                                      {current && !current.enabled && (
                                        <span className="rounded bg-zinc-500/10 px-1.5 py-0.5 text-[10px] font-medium text-foreground-subtle">已停用</span>
                                      )}
                                    </div>
                                    <div className="mt-0.5 font-mono text-[11px] text-foreground-subtle">{item.ruleKey}</div>
                                    {item.description && (
                                      <p className="mt-1 line-clamp-1 text-xs text-foreground-muted">{item.description}</p>
                                    )}
                                  </div>
                                  {selected && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      title="规则设置"
                                      onClick={(e) => {
                                        e.preventDefault()
                                        e.stopPropagation()
                                        setConfigKey(item.ruleKey)
                                      }}
                                    >
                                      <Settings2 className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                </label>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>
      )}

      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="新建分组"
        footer={
          <>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>取消</Button>
            <Button onClick={createGroup} disabled={!newName.trim()}>创建</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>分组名称</Label>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="例如：上线前全面检查" />
          </div>
          <div className="space-y-1.5">
            <Label>说明</Label>
            <Textarea rows={3} value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="可选" />
          </div>
          <p className="text-xs text-foreground-subtle">创建后在右侧「规则库」中勾选要执行的规则。</p>
        </div>
      </Dialog>

      <Dialog
        open={configRule !== null}
        onClose={() => setConfigKey(null)}
        title={configRule ? `规则设置 · ${configRule.name}` : '规则设置'}
        footer={<Button variant="outline" onClick={() => setConfigKey(null)}>完成</Button>}
      >
        {configRule && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3.5 py-2.5">
              <div>
                <div className="text-sm font-medium">启用此规则</div>
                <div className="text-xs text-foreground-subtle">关闭后保留在分组中，但检测时跳过</div>
              </div>
              <Switch checked={configRule.enabled} onCheckedChange={(v) => patchRule(configRule.ruleKey, { enabled: v })} />
            </div>
            <div className="space-y-1.5">
              <Label>内容说明</Label>
              <Input
                value={configRule.description ?? ''}
                onChange={(e) => patchRule(configRule.ruleKey, { description: e.target.value })}
                placeholder="留空则使用检测结果动态描述"
              />
            </div>
            <div className="space-y-1.5">
              <Label>交付成果</Label>
              <Input
                value={configRule.deliverable ?? ''}
                onChange={(e) => patchRule(configRule.ruleKey, { deliverable: e.target.value })}
                placeholder="留空则使用预设文案"
              />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3.5 py-2.5">
              <div>
                <div className="text-sm font-medium">默认通过</div>
                <div className="text-xs text-foreground-subtle">开启后直接按「通过」计，跳过实际检测</div>
              </div>
              <Switch
                checked={configRule.params?.defaultPass === true}
                onCheckedChange={(v) => patchRule(configRule.ruleKey, { params: { ...configRule.params, defaultPass: v } })}
              />
            </div>
          </div>
        )}
      </Dialog>
    </div>
  )
}
