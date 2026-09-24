import { ShieldCheck, Globe, ListChecks, FileText } from 'lucide-react'

const steps = [
  { icon: Globe, title: '1. 添加站点', desc: '在「站点管理」新建或批量导入待检测网站。', accent: 'text-sky-500 bg-sky-500/10' },
  { icon: ListChecks, title: '2. 选择规则集', desc: '选用内置「全面检查」或「快速安全」，也可自定义规则与阈值。', accent: 'text-violet-500 bg-violet-500/10' },
  { icon: ShieldCheck, title: '3. 开始检测', desc: '在「检测与历史」一键运行，后台真实浏览器渲染页面，实时显示进度。', accent: 'text-emerald-500 bg-emerald-500/10' },
  { icon: FileText, title: '4. 查看报告', desc: '检测完成后查看逐项结果、截图证据与 PageSpeed 截图，导出 PDF 报告。', accent: 'text-amber-500 bg-amber-500/10' }
]

const groups = [
  { name: 'SEO', desc: 'title、description、OG 标签、canonical、robots.txt、sitemap、唯一 h1', color: 'text-sky-600 dark:text-sky-400' },
  { name: '性能', desc: 'TTFB、DOM 加载、完整加载、页面体积、LCP', color: 'text-violet-600 dark:text-violet-400' },
  { name: '安全', desc: 'HTTPS、证书、HSTS、安全响应头、敏感信息、混合内容', color: 'text-emerald-600 dark:text-emerald-400' },
  { name: '内容与可用性', desc: 'UTF-8、favicon、viewport、JS 错误、404 友好', color: 'text-amber-600 dark:text-amber-400' },
  { name: '合规（按需）', desc: 'ICP 备案号、隐私政策入口、版权年份', color: 'text-rose-600 dark:text-rose-400' }
]

export default function DocsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-xl font-bold tracking-tight">使用说明</h1>
        <p className="mt-0.5 text-sm text-foreground-muted">网站合规性检测（Next.js 版）使用流程与规则说明。</p>
      </div>

      {/* 四步流程 */}
      <section className="grid gap-4 sm:grid-cols-2">
        {steps.map((s) => {
          const Icon = s.icon
          return (
            <div key={s.title} className="rounded-xl border border-border bg-background-elevated p-5 shadow-sm transition-shadow hover:shadow-md">
              <div className="flex items-center gap-3">
                <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${s.accent}`}>
                  <Icon className="h-4.5 w-4.5" />
                </span>
                <div className="text-sm font-semibold">{s.title}</div>
              </div>
              <p className="mt-2.5 text-sm leading-6 text-foreground-muted">{s.desc}</p>
            </div>
          )
        })}
      </section>

      {/* 规则说明 */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
          内置规则集（27 条规则）
        </h2>
        <div className="space-y-3">
          {groups.map((g) => (
            <div key={g.name} className="rounded-xl border border-border bg-background-elevated p-4 shadow-sm">
              <div className={`text-sm font-semibold ${g.color}`}>{g.name}</div>
              <p className="mt-1 text-sm leading-6 text-foreground-muted">{g.desc}</p>
            </div>
          ))}
        </div>
      </section>

    </div>
  )
}
