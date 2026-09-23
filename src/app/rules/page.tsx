'use client'

import * as React from 'react'
import { Plus, Copy, Trash2, ChevronRight, Save, ListChecks } from 'lucide-react'
import { Button, Card, Dialog, Input, Textarea, Label, Empty, Switch } from '@/components/ui'
import type { RuleSet, Rule } from '@/lib/types'
import { fetchJson, friendlyError } from '@/lib/client-fetch'

type RuleRow = Omit<Rule, 'id'> & { id?: number }

export default function RulesPage() {
  const [ruleSets, setRuleSets] = React.useState<RuleSet[]>([])
  const [catalog, setCatalog] = React.useState<RuleRow[]>([])
  const [selectedId, setSelectedId] = React.useState<number | null>(null)
  const [rules, setRules] = React.useState<RuleRow[]>([])
  const [dirty, setDirty] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [createOpen, setCreateOpen] = React.useState(false)
  const [newName, setNewName] = React.useState('')
  const [newDesc, setNewDesc] = React.useState('')
  const [addOpen, setAddOpen] = React.useState(false)
  const [expandGroup, setExpandGroup] = React.useState<Record<string, boolean>>({})

  const loadSets = async () => {
    try {
      const data = await fetchJson<RuleSet[]>('/api/rulesets')
      setRuleSets(data)
      if (!selectedId && data.length > 0) setSelectedId(data[0].id)
      setError('')
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setLoading(false)
    }
  }

  const loadRules = async (id: number) => {
    try {
      setRules(await fetchJson<RuleRow[]>(`/api/rulesets/${id}/rules`))
      setDirty(false)
      setError('')
    } catch (e) {
      setError(friendlyError(e))
    }
  }

  const loadCatalog = async () => {
    try {
      setCatalog(await fetchJson<RuleRow[]>('/api/rulesets/catalog'))
      setError('')
    } catch (e) {
      setError(friendlyError(e))
    }
  }

  React.useEffect(() => {
    ;(async () => {
      await loadSets()
      await loadCatalog()
      setLoading(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  React.useEffect(() => {
    if (selectedId !== null) loadRules(selectedId)
    // 仅在切换规则集时触发（loadRules 引用每次渲染变化，不纳入依赖）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  const selectSet = (id: number) => {
    if (dirty && !confirm('当前规则集有未保存的修改，切换将丢失。继续？')) return
    setSelectedId(id)
  }

  const createSet = async () => {
    if (!newName.trim()) return
    const res = await fetch('/api/rulesets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName, description: newDesc })
    })
    const created = await res.json()
    setCreateOpen(false)
    setNewName('')
    setNewDesc('')
    await loadSets()
    setSelectedId(created.id)
  }

  const duplicateSet = async (id: number, name: string) => {
    const res = await fetch(`/api/rulesets/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ duplicate: true, name: `${name} 副本` })
    })
    if (res.ok) {
      const dup = await res.json()
      await loadSets()
      setSelectedId(dup.id)
    }
  }

  const deleteSet = async (id: number, isBuiltin: boolean) => {
    if (isBuiltin) {
      alert('内置规则集不可删除，可「另存为副本」后修改。')
      return
    }
    if (!confirm('确认删除该规则集？')) return
    await fetch(`/api/rulesets/${id}`, { method: 'DELETE' })
    setSelectedId(null)
    await loadSets()
  }

  const patchRule = (rule: RuleRow, patch: Partial<RuleRow>) => {
    setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, ...patch } : r)))
    setDirty(true)
  }

  const addRule = (item: RuleRow) => {
    if (rules.some((r) => r.ruleKey === item.ruleKey)) return
    setRules((prev) => [
      ...prev,
      {
        ...item,
        id: undefined,
        ruleSetId: selectedId ?? 0,
        enabled: true,
        sortOrder: prev.length + 1
      }
    ])
    setDirty(true)
  }

  const removeRule = (rule: RuleRow) => {
    setRules((prev) => prev.filter((r) => r !== rule))
    setDirty(true)
  }

  const saveRules = async () => {
    if (selectedId === null) return
    await fetch(`/api/rulesets/${selectedId}/rules`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rules.map(({ id, ...rest }) => rest))
    })
    setDirty(false)
    await loadSets()
  }

  const groups = React.useMemo(() => {
    const map = new Map<string, RuleRow[]>()
    for (const r of rules) {
      const arr = map.get(r.groupName) ?? []
      arr.push(r)
      map.set(r.groupName, arr)
    }
    return Array.from(map.entries())
  }, [rules])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">规则集管理</h1>
          <p className="mt-0.5 text-sm text-foreground-muted">配置检测规则：增删规则、启停开关、严重级别与阈值参数。</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> 新建规则集
        </Button>
      </div>

      {error && <div className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger-soft-foreground">{error}</div>}

      {loading ? (
        <div className="flex justify-center py-16"><span className="text-sm text-foreground-subtle">加载中…</span></div>
      ) : ruleSets.length === 0 ? (
        <Empty icon={<ListChecks className="h-8 w-8" />} title="还没有规则集" description="点击「新建规则集」创建，或重启应用自动生成内置规则集。" />
      ) : (
        <div className="grid gap-4 md:grid-cols-[250px_1fr]">
          {/* 左侧规则集列表 */}
          <Card className="h-fit overflow-hidden">
            <div className="border-b border-border px-4 py-3 text-sm font-medium">规则集列表</div>
            <nav className="divide-y divide-border/70">
              {ruleSets.map((rs) => {
                const active = selectedId === rs.id
                return (
                  <div
                    key={rs.id}
                    className={`group flex items-center gap-1 px-3 py-2.5 text-sm transition-colors ${
                      active ? 'bg-primary-soft' : 'hover:bg-zinc-50/70 dark:hover:bg-zinc-800/40'
                    }`}
                  >
                    <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => selectSet(rs.id)}>
                      <ChevronRight className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-primary' : 'text-foreground-subtle'}`} />
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate font-medium ${active ? 'text-primary-soft-foreground' : ''}`}>{rs.name}</span>
                        <span className="block text-[11px] text-foreground-subtle">
                          {rs.ruleCount ?? 0} 条规则 · {rs.isBuiltin ? '内置' : '自定义'}
                        </span>
                      </span>
                    </button>
                    <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button variant="ghost" size="sm" onClick={() => duplicateSet(rs.id, rs.name)} title="复制为副本">
                        <Copy className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => deleteSet(rs.id, rs.isBuiltin)} title={rs.isBuiltin ? '内置集不可删除' : '删除'} disabled={rs.isBuiltin}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </nav>
          </Card>

          {/* 右侧规则编辑 */}
          {selectedId !== null && (
            <Card className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-zinc-50/60 px-5 py-3.5 dark:bg-zinc-800/20">
                <div>
                  <h2 className="text-base font-semibold">{ruleSets.find((r) => r.id === selectedId)?.name}</h2>
                  <p className="mt-0.5 text-xs text-foreground-subtle">{rules.filter((r) => r.enabled).length}/{rules.length} 条启用</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
                    <Plus className="h-3.5 w-3.5" /> 添加规则
                  </Button>
                  <Button size="sm" onClick={saveRules} disabled={!dirty}>
                    <Save className="h-3.5 w-3.5" /> {dirty ? '保存修改' : '已保存'}
                  </Button>
                </div>
              </div>

              <div className="space-y-4 p-5">
                {groups.length === 0 ? (
                  <Empty icon={<ListChecks className="h-8 w-8" />} title="该规则集没有规则" description="点击「添加规则」从规则目录中选择。" />
                ) : (
                  groups.map(([groupName, groupRules]) => {
                    const expanded = expandGroup[groupName] !== false
                    return (
                      <div key={groupName}>
                        <button
                          className="flex w-full items-center justify-between rounded-md border border-border bg-zinc-50/60 px-3.5 py-2.5 text-sm font-medium transition-colors hover:bg-zinc-100/70 dark:bg-zinc-800/30 dark:hover:bg-zinc-800/60"
                          onClick={() => setExpandGroup((g) => ({ ...g, [groupName]: !g[groupName] }))}
                          aria-expanded={expanded}
                        >
                          <span>
                            {groupName} <span className="text-xs font-normal text-foreground-subtle">（{groupRules.length}）</span>
                          </span>
                          <ChevronRight className={`h-4 w-4 text-foreground-subtle transition-transform ${expanded ? 'rotate-90' : ''}`} />
                        </button>
                        {expanded && (
                          <div className="mt-2 space-y-2">
                            {groupRules.map((rule) => (
                              <div
                                key={rule.id ?? rule.ruleKey}
                                className={`flex flex-wrap items-center gap-3 rounded-lg border px-3.5 py-2.5 transition-colors ${
                                  rule.enabled
                                    ? 'border-border bg-background'
                                    : 'border-dashed border-border-strong bg-zinc-50/40 opacity-70 dark:bg-zinc-800/20'
                                }`}
                              >
                                <Switch checked={rule.enabled} onCheckedChange={(v) => patchRule(rule, { enabled: v })} />
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm font-medium">{rule.name}</div>
                                  <div className="font-mono text-[11px] text-foreground-subtle">{rule.ruleKey}</div>
                                </div>
                                <label className="flex items-center gap-1.5 text-xs text-foreground-muted" title="开启后检测直接按「通过」计，跳过实际检测">
                                  <Switch
                                    checked={rule.params?.defaultPass === true}
                                    onCheckedChange={(v) => patchRule(rule, { params: { ...rule.params, defaultPass: v } })}
                                  />
                                  默认通过
                                </label>
                                <Button variant="ghost" size="sm" onClick={() => removeRule(rule)}>
                                  <Trash2 className="h-3.5 w-3.5 text-danger" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </Card>
          )}
        </div>
      )}

      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="新建规则集"
        footer={
          <>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>取消</Button>
            <Button onClick={createSet} disabled={!newName.trim()}>创建</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>名称</Label>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="例如：上线前全面检查" />
          </div>
          <div className="space-y-1.5">
            <Label>描述</Label>
            <Textarea rows={3} value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="可选" />
          </div>
        </div>
      </Dialog>

      <Dialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="从规则目录添加"
        width="max-w-2xl"
        footer={<Button variant="outline" onClick={() => setAddOpen(false)}>完成</Button>}
      >
        <div className="space-y-2">
          <p className="text-xs text-foreground-subtle">点击规则将其加入当前规则集；重复规则会自动跳过。</p>
          {Array.from(new Map(catalog.map((r) => [r.groupName, r])).keys()).map((groupName) => (
            <div key={groupName} className="overflow-hidden rounded-md border border-border">
              <div className="border-b border-border bg-zinc-50/60 px-3 py-1.5 text-sm font-medium dark:bg-zinc-800/30">{groupName}</div>
              <div className="divide-y divide-border/70">
                {catalog.filter((r) => r.groupName === groupName).map((item) => {
                  const added = rules.some((r) => r.ruleKey === item.ruleKey)
                  return (
                    <button
                      key={item.ruleKey}
                      onClick={() => addRule(item)}
                      disabled={added}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-zinc-50/70 disabled:opacity-45 disabled:hover:bg-transparent dark:hover:bg-zinc-800/40"
                    >
                      <span className="flex items-center gap-2">
                        <span>{item.name}</span>
                      </span>
                      <span className="text-xs text-foreground-subtle">{added ? '已添加' : '＋ 添加'}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </Dialog>
    </div>
  )
}


