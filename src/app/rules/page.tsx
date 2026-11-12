'use client'

import * as React from 'react'
import { ChevronDown, ChevronRight, GripVertical, ListChecks, Plus, Save, Search, Trash2 } from 'lucide-react'
import { Button, Card, Dialog, Empty, Input, Label, PageHeader, Select, Spinner, Switch, Textarea } from '@/components/ui'
import { useConfirm } from '@/components/confirm'
import type { Rule, RuleKind, RuleSet } from '@/lib/types'
import { RULE_KINDS } from '@/lib/types'
import { fetchJson, friendlyError } from '@/lib/client-fetch'

type CatalogRule = {
  groupName: string
  ruleKey: string
  name: string
  description?: string
  deliverable?: string
  scope?: 'page' | 'site'
  kind?: RuleKind
  params: Record<string, unknown>
}

type DraftRule = Omit<Rule, 'id'> & { id?: number }
type GroupForm = { name: string; description: string; scanPages: boolean }

const EMPTY_FORM: GroupForm = { name: '', description: '', scanPages: false }
const KIND_OPTIONS = RULE_KINDS.map((kind) => ({ value: kind.key, label: kind.label }))

/** 添加规则弹窗的业务分类：功能检测页签包含机器检测与 PageSpeed 等产物 */
type PickerCategory = 'functional' | 'deliverable'

function categoryOf(kind: RuleKind): PickerCategory {
  return kind === 'deliverable' ? 'deliverable' : 'functional'
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
    kind: item.kind ?? 'check',
    params: item.params ?? {},
    sortOrder
  }
}

function formOf(set: RuleSet): GroupForm {
  return { name: set.name, description: set.description, scanPages: set.scanPages }
}

function kindMeta(kind: RuleKind) {
  return RULE_KINDS.find((item) => item.key === kind) ?? RULE_KINDS[0]
}

export default function RulesPage() {
  const confirm = useConfirm()
  const [sets, setSets] = React.useState<RuleSet[]>([])
  const [catalog, setCatalog] = React.useState<CatalogRule[]>([])
  const [selectedId, setSelectedId] = React.useState<number | null>(null)
  const [rules, setRules] = React.useState<DraftRule[]>([])
  const [form, setForm] = React.useState<GroupForm>(EMPTY_FORM)
  const [dirty, setDirty] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [query, setQuery] = React.useState('')
  const [expanded, setExpanded] = React.useState<string | null>(null)
  const [draggedKey, setDraggedKey] = React.useState<string | null>(null)
  const [dragOverKey, setDragOverKey] = React.useState<string | null>(null)
  const [dragOverAfter, setDragOverAfter] = React.useState(false)
  const [groupOpen, setGroupOpen] = React.useState(false)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [newName, setNewName] = React.useState('')
  const [newDesc, setNewDesc] = React.useState('')
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const [pickerQuery, setPickerQuery] = React.useState('')
  const [pickerCategory, setPickerCategory] = React.useState<PickerCategory>('functional')
  const [pickerKeys, setPickerKeys] = React.useState<Set<string>>(new Set())
  const groupSnapshot = React.useRef<{ form: GroupForm; dirty: boolean } | null>(null)

  const selectedSet = sets.find((set) => set.id === selectedId) ?? null
  const byKey = React.useMemo(() => new Map(rules.map((rule) => [rule.ruleKey, rule])), [rules])

  React.useEffect(() => {
    ;(async () => {
      try {
        const [setData, catalogData] = await Promise.all([
          fetchJson<RuleSet[]>('/api/rulesets'),
          fetchJson<CatalogRule[]>('/api/rulesets/catalog')
        ])
        setSets(setData)
        setCatalog(catalogData)
        if (setData[0]) await chooseSet(setData[0], false)
      } catch (e) {
        setError(friendlyError(e))
      } finally {
        setLoading(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function chooseSet(set: RuleSet, guard = true) {
    if (guard && dirty) {
      const ok = await confirm({
        title: '放弃未保存的修改？',
        description: '切换分组会丢失当前未保存的修改。',
        confirmText: '继续切换',
        cancelText: '留在当前分组',
        danger: false
      })
      if (!ok) return
    }
    setSelectedId(set.id)
    setForm(formOf(set))
    setRules((await fetchJson<DraftRule[]>(`/api/rulesets/${set.id}/rules`)).map((rule) => ({ ...rule, enabled: true })))
    setDirty(false)
    setExpanded(null)
    setError('')
  }

  const refreshSets = async () => {
    const data = await fetchJson<RuleSet[]>('/api/rulesets')
    setSets(data)
    return data
  }

  const patchRule = (ruleKey: string, patch: Partial<DraftRule>) => {
    setRules((prev) => prev.map((rule) => (rule.ruleKey === ruleKey ? { ...rule, ...patch } : rule)))
    setDirty(true)
  }

  const save = React.useCallback(async (nextForm: GroupForm = form, nextRules: DraftRule[] = rules) => {
    if (selectedId === null || !nextForm.name.trim()) return false
    const normalizedRules = nextRules.map((rule, index) => ({ ...rule, sortOrder: index + 1 }))
    setSaving(true)
    try {
      await fetchJson(`/api/rulesets/${selectedId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...nextForm, name: nextForm.name.trim() })
      })
      await fetchJson(`/api/rulesets/${selectedId}/rules`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(normalizedRules.map(({ id, ...rest }) => ({ ...rest, enabled: true })))
      })
      setRules(normalizedRules)
      setForm({ ...nextForm, name: nextForm.name.trim() })
      setDirty(false)
      setError('')
      await refreshSets()
      return true
    } catch (e) {
      setError(friendlyError(e))
      return false
    } finally {
      setSaving(false)
    }
  }, [selectedId, form, rules])

  React.useEffect(() => {
    if (!dirty) return
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void save()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [dirty, save])

  const createGroup = async () => {
    if (!newName.trim()) return
    setSaving(true)
    try {
      const created = await fetchJson<RuleSet>('/api/rulesets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), description: newDesc })
      })
      await refreshSets()
      setSelectedId(created.id)
      setForm(formOf(created))
      setRules([])
      setDirty(false)
      setCreateOpen(false)
      setNewName('')
      setNewDesc('')
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setSaving(false)
    }
  }

  const duplicateSet = async () => {
    if (!selectedSet) return
    try {
      const duplicated = await fetchJson<RuleSet>(`/api/rulesets/${selectedSet.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duplicate: true, name: `${selectedSet.name} 副本` })
      })
      await refreshSets()
      await chooseSet(duplicated, false)
      setGroupOpen(false)
    } catch (e) {
      setError(friendlyError(e))
    }
  }

  const deleteSet = async () => {
    if (!selectedSet) return
    const ok = await confirm({
      title: '删除分组',
      description: `确认删除「${selectedSet.name}」？历史检测记录不受影响。`,
      confirmText: '删除'
    })
    if (!ok) return
    try {
      await fetchJson(`/api/rulesets/${selectedSet.id}`, { method: 'DELETE' })
      const list = await refreshSets()
      setGroupOpen(false)
      if (list[0]) await chooseSet(list[0], false)
      else {
        setSelectedId(null)
        setForm(EMPTY_FORM)
        setRules([])
      }
    } catch (e) {
      setError(friendlyError(e))
    }
  }

  const openPicker = () => {
    setPickerKeys(new Set(rules.map((rule) => rule.ruleKey)))
    setPickerQuery('')
    setPickerCategory('functional')
    setPickerOpen(true)
  }

  const openGroup = () => {
    groupSnapshot.current = { form: { ...form }, dirty }
    setGroupOpen(true)
  }

  const closeGroup = () => {
    if (groupSnapshot.current) {
      setForm(groupSnapshot.current.form)
      setDirty(groupSnapshot.current.dirty)
    }
    groupSnapshot.current = null
    setGroupOpen(false)
  }

  const closePicker = () => {
    setPickerKeys(new Set())
    setPickerOpen(false)
  }

  const togglePickerRule = (ruleKey: string, checked: boolean) => {
    setPickerKeys((prev) => {
      const next = new Set(prev)
      if (checked) next.add(ruleKey)
      else next.delete(ruleKey)
      return next
    })
  }

  /** 弹窗内勾选只暂存；点击保存时才把这套选择合并进当前分组 */
  const pickerRules = React.useMemo(() => {
    const next = rules.filter((rule) => pickerKeys.has(rule.ruleKey))
    const existing = new Set(next.map((rule) => rule.ruleKey))
    for (const item of catalog) {
      if (!pickerKeys.has(item.ruleKey) || existing.has(item.ruleKey)) continue
      next.push(draftOf(item, selectedId ?? 0, next.length + 1))
      existing.add(item.ruleKey)
    }
    return next
  }, [rules, pickerKeys, catalog, selectedId])

  const savePicker = async () => {
    if (await save(form, pickerRules)) {
      setPickerKeys(new Set())
      setPickerOpen(false)
    }
  }

  const removeRule = (ruleKey: string) => {
    setRules((prev) => prev.filter((rule) => rule.ruleKey !== ruleKey))
    setDirty(true)
  }

  const moveRule = (fromKey: string, toKey: string, after: boolean) => {
    if (fromKey === toKey) return
    setRules((prev) => {
      const from = prev.findIndex((rule) => rule.ruleKey === fromKey)
      if (from < 0) return prev
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      const target = next.findIndex((rule) => rule.ruleKey === toKey)
      if (target < 0) return prev
      next.splice(target + (after ? 1 : 0), 0, moved)
      return next.map((rule, index) => ({ ...rule, sortOrder: index + 1 }))
    })
    setDirty(true)
  }

  const visibleRules = React.useMemo(() => {
    const keyword = query.trim().toLowerCase()
    return rules.filter((rule) => !keyword || `${rule.name} ${rule.ruleKey}`.toLowerCase().includes(keyword))
  }, [rules, query])

  const filteredCatalog = React.useMemo(() => {
    const keyword = pickerQuery.trim().toLowerCase()
    return catalog.filter((item) => {
      const rule = byKey.get(item.ruleKey)
      const kind = rule?.kind ?? item.kind ?? 'check'
      if (categoryOf(kind) !== pickerCategory) return false
      return !keyword || `${item.name} ${item.ruleKey}`.toLowerCase().includes(keyword)
    })
  }, [catalog, byKey, pickerCategory, pickerQuery])

  /** Tab 数量跟随搜索条件，但不受当前 Tab 影响，便于判断其他类型里有多少结果 */
  const pickerCounts = React.useMemo(() => {
    const keyword = pickerQuery.trim().toLowerCase()
    const counts: Record<PickerCategory, number> = { functional: 0, deliverable: 0 }
    for (const item of catalog) {
      if (keyword && !`${item.name} ${item.ruleKey}`.toLowerCase().includes(keyword)) continue
      const kind = byKey.get(item.ruleKey)?.kind ?? item.kind ?? 'check'
      counts[categoryOf(kind)]++
    }
    return counts
  }, [catalog, byKey, pickerQuery])

  const pickerTabs: { key: PickerCategory; label: string }[] = [
    { key: 'functional', label: '功能检测' },
    { key: 'deliverable', label: '合同文案' }
  ]

  if (loading) return <div className="flex justify-center py-24"><Spinner /></div>

  return (
    <div className="space-y-7">
      <PageHeader
        title="规则"
        description="用规则分组定义每次检测的范围。放入分组即启用，移除即停用。"
        actions={<Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> 新建分组</Button>}
      />

      {error && <div className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger-soft-foreground">{error}</div>}

      {sets.length === 0 ? (
        <Empty icon={<ListChecks className="h-7 w-7" />} title="还没有规则分组" description="先新建一个分组，再从规则库添加需要的规则。" />
      ) : (
        <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
          <Card className="h-fit overflow-hidden">
            <nav className="divide-y divide-border">
              {sets.map((set) => (
                <button
                  key={set.id}
                  type="button"
                  onClick={() => void chooseSet(set)}
                  className={`block w-full px-4 py-3 text-left transition-colors ${
                    selectedId === set.id ? 'bg-primary-soft/60' : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.04]'
                  }`}
                >
                  <span className={`block truncate text-sm font-medium ${selectedId === set.id ? 'text-primary-soft-foreground' : ''}`}>{set.name}</span>
                  <span className="mt-0.5 block text-[11px] text-foreground-subtle">
                    {selectedId === set.id ? rules.length : set.ruleCount ?? 0} 条规则
                    {set.isBuiltin ? ' · 默认' : ''}
                  </span>
                </button>
              ))}
            </nav>
          </Card>

          {selectedSet && (
            <div className="space-y-4">
              <Card className="p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-lg font-semibold">{form.name || '未命名分组'}</h2>
                      {dirty && <span className="text-xs font-medium text-warning">未保存</span>}
                    </div>
                    <p className="mt-1 text-xs text-foreground-muted">
                      {rules.length} 条规则{form.scanPages ? ' · 多页面模板检查' : ''}
                    </p>
                    {form.description && <p className="mt-1 text-sm text-foreground-muted">{form.description}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={openGroup}>分组设置</Button>
                    <Button size="sm" onClick={openPicker}><Plus className="h-3.5 w-3.5" /> 添加规则</Button>
                  </div>
                </div>
              </Card>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-0 flex-1 sm:max-w-72">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground-subtle" />
                  <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索规则" className="h-8 pl-8 text-xs" />
                </div>
                {!query.trim() && rules.length > 1 && (
                  <span className="text-xs text-foreground-subtle">拖动左侧手柄调整顺序</span>
                )}
                {dirty && (
                  <Button size="sm" onClick={() => void save()} disabled={saving} className="ml-auto">
                    <Save className="h-3.5 w-3.5" /> {saving ? '保存中…' : '保存'}
                  </Button>
                )}
              </div>

              {rules.length === 0 ? (
                <Empty icon={<ListChecks className="h-7 w-7" />} title="这个分组还没有规则" description="从规则库添加机器检测、合同文案或功能产物。" />
              ) : visibleRules.length === 0 ? (
                <Empty icon={<Search className="h-7 w-7" />} title="没有匹配的规则" description="换个关键词试试。" />
              ) : (
                <div className="space-y-5">
                  <Card className="divide-y divide-border overflow-hidden">
                    {visibleRules.map((rule) => (
                      <RuleItem
                        key={rule.ruleKey}
                        rule={rule}
                        open={expanded === rule.ruleKey}
                        dragging={draggedKey === rule.ruleKey}
                        dragOver={dragOverKey === rule.ruleKey && draggedKey !== rule.ruleKey}
                        dragOverAfter={dragOverAfter}
                        draggable={!query.trim()}
                        onToggle={() => setExpanded(expanded === rule.ruleKey ? null : rule.ruleKey)}
                        onChange={(patch) => patchRule(rule.ruleKey, patch)}
                        onRemove={() => removeRule(rule.ruleKey)}
                        onDragStart={() => setDraggedKey(rule.ruleKey)}
                        onDragOver={(after) => { setDragOverKey(rule.ruleKey); setDragOverAfter(after) }}
                        onDrop={(after) => { if (draggedKey) moveRule(draggedKey, rule.ruleKey, after) }}
                        onDragEnd={() => { setDraggedKey(null); setDragOverKey(null); setDragOverAfter(false) }}
                      />
                    ))}
                  </Card>
                </div>
              )}
            </div>
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
            <Button onClick={() => void createGroup()} disabled={saving || !newName.trim()}>{saving && <Spinner />} 创建</Button>
          </>
        }
      >
        <div className="space-y-4">
          <label className="block space-y-1.5">
            <Label>名称</Label>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="例如：上线前全面检查" autoFocus />
          </label>
          <label className="block space-y-1.5">
            <Label>说明</Label>
            <Textarea rows={3} value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="可选" />
          </label>
        </div>
      </Dialog>

      <Dialog
        open={groupOpen}
        onClose={closeGroup}
        title="分组设置"
        footer={
          <>
            <div className="mr-auto flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => void duplicateSet()}>复制</Button>
              <Button variant="ghost" size="sm" onClick={() => void deleteSet()}>删除</Button>
            </div>
            <Button variant="outline" onClick={closeGroup}>取消</Button>
            <Button onClick={async () => { if (await save(form)) { groupSnapshot.current = null; setGroupOpen(false) } }} disabled={saving || !form.name.trim()}>保存</Button>
          </>
        }
      >
        <div className="space-y-4">
          <label className="block space-y-1.5">
            <Label>名称</Label>
            <Input value={form.name} onChange={(e) => { setForm({ ...form, name: e.target.value }); setDirty(true) }} />
          </label>
          <label className="block space-y-1.5">
            <Label>说明</Label>
            <Textarea rows={3} value={form.description} onChange={(e) => { setForm({ ...form, description: e.target.value }); setDirty(true) }} placeholder="可选" />
          </label>
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3.5 py-3">
            <div>
              <div className="text-sm font-medium">多页面模板检查</div>
              <div className="mt-0.5 text-xs text-foreground-muted">按 sitemap 枚举并为页面级规则去重模板；H1 / 隐藏板块始终按 sitemap 全部页面、新闻、产品逐页检查。</div>
            </div>
            <Switch checked={form.scanPages} onCheckedChange={(checked) => { setForm({ ...form, scanPages: checked }); setDirty(true) }} />
          </div>
        </div>
      </Dialog>

      <Dialog
        open={pickerOpen}
        onClose={closePicker}
        title="添加规则"
        width="max-w-3xl"
        footer={
          <>
            <span className="mr-auto self-center text-xs text-foreground-subtle">已选 {pickerKeys.size} 条</span>
            <Button variant="outline" onClick={closePicker}>取消</Button>
            <Button onClick={savePicker} disabled={saving}>保存并关闭</Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="flex gap-5 border-b border-border">
            {pickerTabs.map((tab) => {
              const active = pickerCategory === tab.key
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setPickerCategory(tab.key)}
                  className={`-mb-px shrink-0 border-b-2 pb-2 text-xs font-medium transition-colors ${
                    active
                      ? 'border-primary text-foreground'
                      : 'border-transparent text-foreground-muted hover:text-foreground'
                  }`}
                >
                  {tab.label}
                  <span className={`ml-1 tabular-nums ${active ? 'text-primary' : 'text-foreground-subtle'}`}>{pickerCounts[tab.key]}</span>
                </button>
              )
            })}
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground-subtle" />
            <Input value={pickerQuery} onChange={(e) => setPickerQuery(e.target.value)} placeholder="搜索规则名称或 key" className="h-8 pl-8 text-xs" />
          </div>
          {filteredCatalog.length === 0 ? (
            <Empty title="没有匹配的规则" description="换个关键词试试。" />
          ) : (
            <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
              {filteredCatalog.map((item) => {
                const selected = pickerKeys.has(item.ruleKey)
                const rule = byKey.get(item.ruleKey)
                const kind = rule?.kind ?? item.kind ?? 'check'
                return (
                  <label key={item.ruleKey} className={`flex cursor-pointer items-start gap-2.5 px-3 py-2.5 transition-colors ${selected ? 'bg-primary-soft/30' : 'hover:bg-black/[0.025] dark:hover:bg-white/[0.03]'}`}>
                    <input type="checkbox" checked={selected} onChange={(e) => togglePickerRule(item.ruleKey, e.target.checked)} className="mt-1 h-4 w-4 accent-primary" />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{item.name}</span>
                        <span className="text-[11px] text-foreground-subtle">
                          {categoryOf(kind) === 'functional' && kind === 'artifact' ? '截图产物' : kindMeta(kind).label}
                        </span>
                        {(rule?.scope ?? item.scope) === 'site' && <span className="text-[11px] text-foreground-subtle">站点级</span>}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-foreground-subtle">{item.description || item.ruleKey}</span>
                    </span>
                  </label>
                )
              })}
            </div>
          )}
        </div>
      </Dialog>
    </div>
  )
}

function RuleItem({
  rule,
  open,
  dragging,
  dragOver,
  dragOverAfter,
  draggable,
  onToggle,
  onChange,
  onRemove,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd
}: {
  rule: DraftRule
  open: boolean
  dragging: boolean
  dragOver: boolean
  dragOverAfter: boolean
  draggable: boolean
  onToggle: () => void
  onChange: (patch: Partial<DraftRule>) => void
  onRemove: () => void
  onDragStart: () => void
  onDragOver: (after: boolean) => void
  onDrop: (after: boolean) => void
  onDragEnd: () => void
}) {
  return (
    <div
      onDragOver={(event) => {
        if (!draggable) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        const rect = event.currentTarget.getBoundingClientRect()
        onDragOver(event.clientY > rect.top + rect.height / 2)
      }}
      onDrop={(event) => {
        event.preventDefault()
        const rect = event.currentTarget.getBoundingClientRect()
        onDrop(event.clientY > rect.top + rect.height / 2)
      }}
      onDragEnd={onDragEnd}
      className={`relative transition-opacity ${dragging ? 'opacity-40' : ''} ${
        dragOver
          ? dragOverAfter
            ? 'after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary'
            : 'before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-primary'
          : ''
      }`}
    >
      <div className={`flex items-start gap-1 px-2 py-3 transition-colors hover:bg-black/[0.025] dark:hover:bg-white/[0.03] ${open ? 'bg-black/[0.015] dark:bg-white/[0.02]' : ''}`}>
        <span
          draggable={draggable}
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = 'move'
            event.dataTransfer.setData('text/plain', rule.ruleKey)
            onDragStart()
          }}
          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded text-foreground-subtle ${
            draggable ? 'cursor-grab active:cursor-grabbing' : 'opacity-30'
          }`}
          title={draggable ? '拖动调整顺序' : '清空搜索后可拖动排序'}
          aria-hidden
        >
          <GripVertical className="h-4 w-4" />
        </span>
        <button type="button" onClick={onToggle} className="flex min-w-0 flex-1 items-start gap-2 text-left" aria-expanded={open}>
          <span className="mt-0.5 text-foreground-subtle">{open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{rule.name}</span>
              <span className="rounded bg-black/[0.05] px-1.5 py-0.5 text-[10px] text-foreground-muted dark:bg-white/[0.07]">
                {kindMeta(rule.kind ?? 'check').label}
              </span>
              {rule.scope === 'site' && <span className="rounded bg-primary-soft px-1.5 py-0.5 text-[10px] font-medium text-primary-soft-foreground">站点级</span>}
            </span>
            <span className="mt-0.5 block truncate text-xs text-foreground-subtle">{rule.description || rule.ruleKey}</span>
          </span>
        </button>
      </div>
      {open && (
        <div className="border-t border-border bg-black/[0.015] px-4 py-4 dark:bg-black/10">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5">
              <Label>类型</Label>
              <Select value={rule.kind ?? 'check'} onChange={(value) => onChange({ kind: value as RuleKind })} options={KIND_OPTIONS} className="w-full" />
              <span className="block text-xs text-foreground-muted">{kindMeta(rule.kind ?? 'check').description}</span>
            </label>
            <label className="space-y-1.5">
              <Label>说明</Label>
              <Textarea rows={2} value={rule.description ?? ''} onChange={(e) => onChange({ description: e.target.value })} placeholder="留空使用默认说明" />
            </label>
          </div>
          <label className="mt-4 block space-y-1.5">
            <Label>交付成果</Label>
            <Textarea rows={2} value={rule.deliverable ?? ''} onChange={(e) => onChange({ deliverable: e.target.value })} placeholder="留空使用预设文案" />
          </label>
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="font-mono text-[11px] text-foreground-subtle">{rule.ruleKey}</span>
            <Button variant="ghost" size="sm" onClick={onRemove}><Trash2 className="h-3.5 w-3.5 text-danger" /> 移除</Button>
          </div>
        </div>
      )}
    </div>
  )
}
