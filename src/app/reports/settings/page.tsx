'use client'

import * as React from 'react'
import { Settings, Save, ImageIcon, Trash2 } from 'lucide-react'
import { Button, Card, Dialog, Input, Label } from '@/components/ui'
import type { ReportSettings } from '@/lib/types'

export default function ReportSettingsPage() {
  const [settings, setSettings] = React.useState<ReportSettings | null>(null)
  const [saved, setSaved] = React.useState(false)
  const [logoOpen, setLogoOpen] = React.useState(false)

  const load = async () => {
    const data = await fetch('/api/settings').then((r) => r.json())
    setSettings(data)
  }

  React.useEffect(() => {
    load()
  }, [])

  const save = async () => {
    if (!settings) return
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    })
    if (res.ok) {
      setSettings(await res.json())
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
  }

  const onLogoFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result)
      setSettings((s) => (s ? { ...s, logoPath: dataUrl } : s))
      setLogoOpen(false)
    }
    reader.readAsDataURL(file)
  }

  if (!settings) {
    return <div className="flex justify-center py-16"><span className="text-sm text-foreground-subtle">加载中…</span></div>
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">报告设置</h1>
        <p className="mt-0.5 text-sm text-foreground-muted">配置报告抬头、LOGO、页脚与 PageSpeed API Key。</p>
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border bg-zinc-50/60 px-5 py-3.5 dark:bg-zinc-800/20">
          <Settings className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold">报告模板</h2>
        </div>
        <div className="space-y-5 px-5 py-5">
          <div className="space-y-1.5">
            <Label>公司名称</Label>
            <Input value={settings.companyName} onChange={(e) => setSettings({ ...settings, companyName: e.target.value })} placeholder="显示在报告封面" />
          </div>
          <div className="space-y-1.5">
            <Label>报告标题</Label>
            <Input value={settings.reportTitle} onChange={(e) => setSettings({ ...settings, reportTitle: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>页脚文本</Label>
            <Input value={settings.footerText} onChange={(e) => setSettings({ ...settings, footerText: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>公司 LOGO</Label>
            <div className="flex items-center gap-3">
              {settings.logoPath ? (
                <img
                  src={settings.logoPath.startsWith('data:') ? settings.logoPath : settings.logoPath}
                  alt="logo"
                  className="h-10 rounded-md border border-border bg-gradient-to-r from-blue-800 to-blue-950 object-contain px-2 py-1"
                />
              ) : (
                <span className="flex h-10 w-10 items-center justify-center rounded-md border border-dashed border-border-strong text-foreground-subtle">
                  <ImageIcon className="h-4 w-4" />
                </span>
              )}
              <Button variant="outline" size="sm" onClick={() => setLogoOpen(true)}>
                <ImageIcon className="h-3.5 w-3.5" /> 选择 LOGO 图片
              </Button>
              {settings.logoPath && (
                <Button variant="ghost" size="sm" onClick={() => setSettings({ ...settings, logoPath: '' })}>
                  <Trash2 className="h-3.5 w-3.5 text-danger" /> 清除
                </Button>
              )}
            </div>
            <p className="text-xs text-foreground-subtle">PNG/JPG，建议不超过 200KB；嵌入报告内。</p>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-border bg-zinc-50/60 px-5 py-3.5 dark:bg-zinc-800/20">
          <h2 className="text-base font-semibold">PageSpeed 评分</h2>
        </div>
        <div className="space-y-5 px-5 py-5">
          <div className="space-y-1.5">
            <Label>Google PageSpeed API Key（可选）</Label>
            <Input
              value={settings.psiApiKey}
              onChange={(e) => setSettings({ ...settings, psiApiKey: e.target.value })}
              placeholder="留空则使用本地 Lighthouse（离线可用）"
              type="password"
            />
            <p className="text-xs text-foreground-subtle">配置后优先调用 PSI API；无 Key 或失败时自动回退本地 Lighthouse。</p>
          </div>
        </div>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={save}>
          <Save className="h-4 w-4" /> 保存设置
        </Button>
        {saved && <span className="text-sm font-medium text-success">已保存</span>}
      </div>

      <Dialog open={logoOpen} onClose={() => setLogoOpen(false)} title="选择 LOGO">
        <input
          type="file"
          accept="image/png,image/jpeg,image/svg+xml"
          className="block w-full text-sm text-foreground-muted file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-foreground"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onLogoFile(file)
          }}
        />
      </Dialog>
    </div>
  )
}
