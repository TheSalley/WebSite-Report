'use client'

import * as React from 'react'
import { ImageIcon, Save, Trash2 } from 'lucide-react'
import { Button, Card, Input, Label, PageHeader } from '@/components/ui'
import type { ReportSettings } from '@/lib/types'
import { friendlyError } from '@/lib/client-fetch'

export default function ReportSettingsPage() {
  const [settings, setSettings] = React.useState<ReportSettings | null>(null)
  const [saved, setSaved] = React.useState(false)
  const [error, setError] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const logoRef = React.useRef<HTMLInputElement | null>(null)

  React.useEffect(() => {
    fetch('/api/settings')
      .then((res) => res.json())
      .then(setSettings)
      .catch((e) => setError(friendlyError(e)))
  }, [])

  const save = async () => {
    if (!settings) return
    setSaving(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      })
      if (!res.ok) throw new Error('保存失败')
      setSettings(await res.json())
      setSaved(true)
      setError('')
      window.setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setSaving(false)
    }
  }

  const onLogoFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => setSettings((current) => current ? { ...current, logoPath: String(reader.result) } : current)
    reader.readAsDataURL(file)
  }

  if (!settings) {
    return <div className="py-24 text-center text-sm text-foreground-subtle">加载中…</div>
  }

  return (
    <div className="mx-auto max-w-2xl space-y-7">
      <PageHeader
        title="报告设置"
        description="配置报告抬头、LOGO 与页脚。"
        actions={<Button onClick={save} disabled={saving}><Save className="h-4 w-4" /> {saving ? '保存中…' : '保存'}</Button>}
      />

      {error && <div className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger-soft-foreground">{error}</div>}
      {saved && <div className="text-sm font-medium text-success">设置已保存</div>}

      <Card className="divide-y divide-border">
        <div className="space-y-5 p-5">
          <label className="block space-y-1.5">
            <Label>公司名称</Label>
            <Input value={settings.companyName} onChange={(e) => setSettings({ ...settings, companyName: e.target.value })} placeholder="显示在报告封面" />
          </label>
          <label className="block space-y-1.5">
            <Label>报告标题</Label>
            <Input value={settings.reportTitle} onChange={(e) => setSettings({ ...settings, reportTitle: e.target.value })} />
          </label>
          <label className="block space-y-1.5">
            <Label>页脚文本</Label>
            <Input value={settings.footerText} onChange={(e) => setSettings({ ...settings, footerText: e.target.value })} />
          </label>
        </div>

        <div className="p-5">
          <Label>公司 LOGO</Label>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {settings.logoPath ? (
              <img src={settings.logoPath} alt="公司 LOGO" className="h-10 max-w-40 rounded-md border border-border bg-white object-contain px-2 py-1" />
            ) : (
              <span className="flex h-10 w-10 items-center justify-center rounded-md border border-dashed border-border-strong text-foreground-subtle">
                <ImageIcon className="h-4 w-4" />
              </span>
            )}
            <Button variant="outline" size="sm" onClick={() => logoRef.current?.click()}>
              <ImageIcon className="h-3.5 w-3.5" /> 选择图片
            </Button>
            {settings.logoPath && (
              <Button variant="ghost" size="sm" onClick={() => setSettings({ ...settings, logoPath: '' })}>
                <Trash2 className="h-3.5 w-3.5 text-danger" /> 清除
              </Button>
            )}
          </div>
          <p className="mt-2 text-xs text-foreground-subtle">PNG、JPG 或 SVG，建议小于 200KB。</p>
          <input
            ref={logoRef}
            type="file"
            accept="image/png,image/jpeg,image/svg+xml"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) onLogoFile(file)
              e.target.value = ''
            }}
          />
        </div>
      </Card>
    </div>
  )
}
