'use client'

import * as React from 'react'
import { ExternalLink, Globe, Pencil, Plus, Trash2, Upload } from 'lucide-react'
import { Button, Card, Dialog, Empty, Input, Label, PageHeader, Spinner, Textarea } from '@/components/ui'
import { useConfirm } from '@/components/confirm'
import type { Site } from '@/lib/types'
import { fetchJson, friendlyError } from '@/lib/client-fetch'
import { displayUrl } from '@/lib/display'

export default function SitesPage() {
  const confirm = useConfirm()
  const [sites, setSites] = React.useState<Site[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [editOpen, setEditOpen] = React.useState(false)
  const [importOpen, setImportOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Site | null>(null)
  const [form, setForm] = React.useState({ name: '', url: '', remark: '' })
  const [importText, setImportText] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [notice, setNotice] = React.useState('')

  const load = React.useCallback(async () => {
    try {
      setSites(await fetchJson<Site[]>('/api/sites'))
      setError('')
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { void load() }, [load])

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
    setSaving(true)
    try {
      const url = editing ? `/api/sites/${editing.id}` : '/api/sites'
      const res = await fetch(url, {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? '保存失败')
      setEditOpen(false)
      setError('')
      await load()
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (site: Site) => {
    const ok = await confirm({
      title: '删除站点',
      description: `确认删除「${site.name}」？此操作不可撤销。`,
      confirmText: '删除'
    })
    if (!ok) return
    try {
      await fetch(`/api/sites/${site.id}`, { method: 'DELETE' })
      await load()
    } catch (e) {
      setError(friendlyError(e))
    }
  }

  const doImport = async () => {
    const urls = importText.split('\n').map((item) => item.trim()).filter(Boolean)
    if (urls.length === 0) return
    setSaving(true)
    try {
      const res = await fetch('/api/sites/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls })
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? '导入失败')
      setImportText('')
      setImportOpen(false)
      setNotice(`导入完成：新增 ${body.created ?? 0} 个，跳过 ${body.skipped ?? 0} 个`)
      await load()
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-7">
      <PageHeader
        title="站点"
        description="维护需要检测的网站。"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <Upload className="h-3.5 w-3.5" /> 批量导入
            </Button>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" /> 新建站点
            </Button>
          </>
        }
      />

      {error && <div className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger-soft-foreground">{error}</div>}
      {notice && <div className="rounded-lg bg-success-soft px-4 py-3 text-sm text-success-soft-foreground">{notice}</div>}

      {loading ? (
        <Card className="flex justify-center py-16"><Spinner /></Card>
      ) : sites.length === 0 ? (
        <Empty icon={<Globe className="h-7 w-7" />} title="还没有站点" description="新建一个站点，或批量导入网址清单。" />
      ) : (
        <Card className="divide-y divide-border overflow-hidden">
          {sites.map((site) => (
            <div key={site.id} className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] sm:items-center">
              <div className="min-w-0">
                <div className="truncate font-medium">{site.name}</div>
                {site.remark && <div className="mt-0.5 truncate text-xs text-foreground-subtle">{site.remark}</div>}
              </div>
              <a
                href={site.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-w-0 items-center gap-1.5 text-sm text-foreground-muted hover:text-primary"
              >
                <span className="truncate">{displayUrl(site.url)}</span>
                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
              </a>
              <div className="flex items-center justify-between gap-2 sm:justify-end">
                <span className="text-xs tabular-nums text-foreground-subtle">{new Date(site.createdAt).toLocaleDateString('zh-CN')}</span>
                <div className="flex items-center gap-0.5">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(site)} aria-label={`编辑 ${site.name}`}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => remove(site)} aria-label={`删除 ${site.name}`}>
                    <Trash2 className="h-3.5 w-3.5 text-danger" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </Card>
      )}

      <Dialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title={editing ? '编辑站点' : '新建站点'}
        footer={
          <>
            <Button variant="outline" onClick={() => setEditOpen(false)}>取消</Button>
            <Button onClick={save} disabled={saving}>{saving && <Spinner />} 保存</Button>
          </>
        }
      >
        <div className="space-y-4">
          <label className="block space-y-1.5">
            <Label>站点名称</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例如：公司官网" autoFocus />
          </label>
          <label className="block space-y-1.5">
            <Label>URL</Label>
            <Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://example.com" />
            <span className="block text-xs text-foreground-subtle">未填写协议时自动补全为 https://</span>
          </label>
          <label className="block space-y-1.5">
            <Label>备注</Label>
            <Textarea value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} rows={3} placeholder="可选" />
          </label>
        </div>
      </Dialog>

      <Dialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="批量导入站点"
        footer={
          <>
            <Button variant="outline" onClick={() => setImportOpen(false)}>取消</Button>
            <Button onClick={doImport} disabled={saving}>{saving && <Spinner />} 导入</Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-foreground-muted">每行一个 URL，名称自动取主机名，重复地址会跳过。</p>
          <Textarea rows={8} value={importText} onChange={(e) => setImportText(e.target.value)} placeholder={'https://example.com\nhttps://example.org'} />
        </div>
      </Dialog>
    </div>
  )
}
