'use client'

import * as React from 'react'
import { Plus, Pencil, Trash2, Globe, Upload, ExternalLink } from 'lucide-react'
import { Button, Card, Dialog, Input, Textarea, Label, Empty } from '@/components/ui'
import type { Site } from '@/lib/types'

export default function SitesPage() {
  const [sites, setSites] = React.useState<Site[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [editOpen, setEditOpen] = React.useState(false)
  const [importOpen, setImportOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Site | null>(null)
  const [form, setForm] = React.useState({ name: '', url: '', remark: '' })
  const [importText, setImportText] = React.useState('')
  const [selected, setSelected] = React.useState<Set<number>>(new Set())

  const load = async () => {
    try {
      const data = await fetch('/api/sites').then((r) => r.json())
      setSites(data)
      setError('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  React.useEffect(() => {
    load()
  }, [])

  const openCreate = () => {
    setEditing(null)
    setForm({ name: '', url: '', remark: '' })
    setEditOpen(true)
  }

  const openEdit = (site: Site) => {
    setEditing(site)
    setForm({ name: site.name, url: site.url, remark: site.remark })
    setEditOpen(true)
  }

  const save = async () => {
    if (!form.name.trim() || !form.url.trim()) {
      setError('名称和 URL 为必填项')
      return
    }
    try {
      if (editing) {
        await fetch(`/api/sites/${editing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form)
        })
      } else {
        await fetch('/api/sites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form)
        })
      }
      setEditOpen(false)
      setError('')
      load()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const remove = async (id: number) => {
    if (!confirm('确认删除该站点？')) return
    await fetch(`/api/sites/${id}`, { method: 'DELETE' })
    load()
  }

  const removeMany = async () => {
    if (selected.size === 0) return
    if (!confirm(`确认删除选中的 ${selected.size} 个站点？`)) return
    await Promise.all([...selected].map((id) => fetch(`/api/sites/${id}`, { method: 'DELETE' })))
    setSelected(new Set())
    load()
  }

  const doImport = async () => {
    const urls = importText.split('\n').map((s) => s.trim()).filter(Boolean)
    if (urls.length === 0) return
    const res = await fetch('/api/sites/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls })
    })
    const body = await res.json()
    setImportText('')
    setImportOpen(false)
    alert(`导入完成：新增 ${body.created} 个，跳过 ${body.skipped} 个`)
    load()
  }

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    setSelected((prev) => (prev.size === sites.length ? new Set() : new Set(sites.map((s) => s.id))))
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">站点管理</h1>
          <p className="mt-0.5 text-sm text-foreground-muted">维护待检测的站点清单，支持批量导入。</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            <Upload className="h-3.5 w-3.5" /> 批量导入
          </Button>
          {selected.size > 0 && (
            <Button variant="danger" size="sm" onClick={removeMany}>
              <Trash2 className="h-3.5 w-3.5" /> 删除选中（{selected.size}）
            </Button>
          )}
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> 新建站点
          </Button>
        </div>
      </div>

      {error && <div className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger-soft-foreground">{error}</div>}

      {loading ? (
        <div className="flex justify-center py-16"><span className="text-sm text-foreground-subtle">加载中…</span></div>
      ) : sites.length === 0 ? (
        <Empty icon={<Globe className="h-8 w-8" />} title="还没有站点" description="点击「新建站点」或「批量导入」添加待检测网站。" />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-zinc-50/60 text-xs text-foreground-muted dark:bg-zinc-800/30">
                  <th className="w-8 px-4 py-3">
                    <input
                      type="checkbox"
                      className="accent-blue-600"
                      checked={selected.size === sites.length && sites.length > 0}
                      onChange={toggleAll}
                      aria-label="全选"
                    />
                  </th>
                  <th className="px-4 py-3 font-medium">名称</th>
                  <th className="px-4 py-3 font-medium">URL</th>
                  <th className="px-4 py-3 font-medium">备注</th>
                  <th className="px-4 py-3 font-medium">创建时间</th>
                  <th className="px-4 py-3 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {sites.map((s) => (
                  <tr key={s.id} className="border-b border-border/70 transition-colors hover:bg-zinc-50/70 dark:hover:bg-zinc-800/40">
                    <td className="px-4 py-3.5">
                      <input
                        type="checkbox"
                        className="accent-blue-600"
                        checked={selected.has(s.id)}
                        onChange={() => toggle(s.id)}
                        aria-label={`选择 ${s.name}`}
                      />
                    </td>
                    <td className="px-4 py-3.5 font-medium">{s.name}</td>
                    <td className="px-4 py-3.5">
                      <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                        <span className="max-w-[220px] truncate">{s.url}</span>
                        <ExternalLink className="h-3 w-3 shrink-0" />
                      </a>
                    </td>
                    <td className="max-w-[200px] truncate px-4 py-3.5 text-xs text-foreground-subtle">{s.remark || '—'}</td>
                    <td className="px-4 py-3.5 text-xs text-foreground-subtle">{new Date(s.createdAt).toLocaleDateString('zh-CN')}</td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(s)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => remove(s.id)}>
                          <Trash2 className="h-3.5 w-3.5 text-danger" />
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

      <Dialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title={editing ? '编辑站点' : '新建站点'}
        footer={
          <>
            <Button variant="outline" onClick={() => setEditOpen(false)}>取消</Button>
            <Button onClick={save}>保存</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>站点名称</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例如：公司官网" />
          </div>
          <div className="space-y-1.5">
            <Label>URL</Label>
            <Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://example.com" />
            <p className="text-xs text-foreground-subtle">未填写协议时自动补全为 https://</p>
          </div>
          <div className="space-y-1.5">
            <Label>备注</Label>
            <Textarea value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} rows={3} placeholder="可选" />
          </div>
        </div>
      </Dialog>

      <Dialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="批量导入站点"
        footer={
          <>
            <Button variant="outline" onClick={() => setImportOpen(false)}>取消</Button>
            <Button onClick={doImport}>导入</Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-foreground-muted">每行一个 URL，站点名称自动取主机名；重复地址将跳过。</p>
          <Textarea rows={8} value={importText} onChange={(e) => setImportText(e.target.value)} placeholder={"https://example.com\nhttps://example.org"} />
        </div>
      </Dialog>
    </div>
  )
}
