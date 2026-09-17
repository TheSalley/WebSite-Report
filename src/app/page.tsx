import Link from 'next/link'
import { ShieldCheck, Globe, ListChecks, FileText, ArrowRight, Sparkles, CheckCircle2 } from 'lucide-react'

const features = [
  {
    icon: Globe,
    title: '真实浏览器检测',
    desc: 'Playwright 无头 Chromium 渲染页面，支持 JS/SPA、移动端模拟，非简单 HTTP 抓取。',
    accent: 'from-blue-500 to-indigo-500'
  },
  {
    icon: ListChecks,
    title: '27 条内置规则',
    desc: 'SEO、性能、安全、内容可用性、合规五维规则集，可自定义阈值与启停。',
    accent: 'from-emerald-500 to-teal-500'
  },
  {
    icon: FileText,
    title: '截图取证与报告',
    desc: '失败/警告项自动全页截图，一键生成所见即所得报告（可打印 PDF）。',
    accent: 'from-amber-500 to-orange-500'
  },
  {
    icon: ShieldCheck,
    title: 'PageSpeed 双重通道',
    desc: '本地 Lighthouse 离线评分，配置 API Key 可切换 Google PSI 双通道。',
    accent: 'from-violet-500 to-purple-500'
  }
]

const steps = ['添加站点', '选择规则集', '开始检测', '查看报告']

export default function Home() {
  return (
    <div className="space-y-10">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl border border-border bg-background-elevated p-8 shadow-sm sm:p-12">
        <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-16 h-56 w-56 rounded-full bg-violet-500/10 blur-3xl" />

        <div className="relative">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary-soft px-3 py-1 text-xs font-medium text-primary-soft-foreground">
            <Sparkles className="h-3.5 w-3.5" /> 自动化合规检测引擎
          </span>
          <h1 className="mt-4 max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">
            网站合规性检测
          </h1>
          <p className="mt-3 max-w-2xl leading-7 text-foreground-muted">
            输入网址，选择规则集，真实浏览器深度检测站点合规性，自动截图取证并生成得分报告。
            面向质检/合规人员、项目交付与网站运营人员。
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              href="/runs"
              className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary-hover"
            >
              开始检测 <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/docs"
              className="inline-flex h-10 items-center gap-2 rounded-md border border-border-strong bg-background-elevated px-6 text-sm font-medium shadow-sm transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
            >
              查看使用说明
            </Link>
          </div>

          {/* 流程条 */}
          <div className="mt-9 flex flex-wrap items-center gap-2 text-xs text-foreground-muted">
            {steps.map((s, i) => (
              <span key={s} className="flex items-center gap-2">
                {i > 0 && <span className="h-px w-6 bg-border-strong" />}
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> {s}
                </span>
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* 特性卡片 */}
      <section className="grid gap-4 sm:grid-cols-2">
        {features.map((f) => {
          const Icon = f.icon
          return (
            <div
              key={f.title}
              className="group relative overflow-hidden rounded-xl border border-border bg-background-elevated p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${f.accent}`} />
              <div className="flex items-center gap-3">
                <span className={`flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br ${f.accent} text-white shadow-sm`}>
                  <Icon className="h-4.5 w-4.5" />
                </span>
                <h2 className="text-sm font-semibold">{f.title}</h2>
              </div>
              <p className="mt-3 text-sm leading-6 text-foreground-muted">{f.desc}</p>
            </div>
          )
        })}
      </section>

      {/* 底部统计带 */}
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { num: '27', label: '内置检测规则' },
          { num: '5', label: '检测维度' },
          { num: '2', label: 'PageSpeed 通道' },
          { num: 'PDF', label: '报告导出' }
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-background-elevated px-5 py-4 text-center shadow-sm">
            <div className="font-mono text-2xl font-bold text-primary">{s.num}</div>
            <div className="mt-1 text-xs text-foreground-muted">{s.label}</div>
          </div>
        ))}
      </section>
    </div>
  )
}
