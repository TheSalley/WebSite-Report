import type { PageSpeedReportData, PageSpeedStrategyResult } from '../types'

/** PSI API 端点（pagespeed.dev 同源数据接口） */
const PSI_ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed'

/** 需要采集的评分类别 */
export const PSI_CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo']

/** 核心指标（audit id → 中文标题） */
const METRIC_TITLE: Record<string, string> = {
  'first-contentful-paint': '首次内容绘制 (FCP)',
  'largest-contentful-paint': '最大内容绘制 (LCP)',
  'total-blocking-time': '总阻塞时间 (TBT)',
  'cumulative-layout-shift': '累计布局偏移 (CLS)',
  'speed-index': '速度指数 (SI)',
  interactive: '可交互时间 (TTI)'
}

/**
 * 从 PSI API 返回的 Lighthouse JSON（lighthouseResult）中提取评分与核心指标。
 */
function parseLighthouseResult(strategy: 'mobile' | 'desktop', lhr: unknown): PageSpeedStrategyResult {
  const lhrObj = (lhr ?? {}) as Record<string, unknown>
  const cats = (lhrObj.categories ?? {}) as Record<string, { title?: string; score?: number }>
  const audits = (lhrObj.audits ?? {}) as Record<string, { title?: string; displayValue?: unknown; score?: number }>

  const categoryItems = Object.entries(cats)
    .filter(([id]) => PSI_CATEGORIES.includes(id))
    .map(([id, v]) => ({
      id,
      title: String(v.title ?? id),
      score: typeof v.score === 'number' ? Math.round(v.score * 100) : null
    }))
    .sort((a, b) => PSI_CATEGORIES.indexOf(a.id) - PSI_CATEGORIES.indexOf(b.id))

  const metricItems = Object.entries(METRIC_TITLE)
    .filter(([auditId]) => audits[auditId])
    .map(([auditId, title]) => {
      const a = audits[auditId]
      return {
        id: auditId,
        title,
        displayValue: String(a.displayValue ?? ''),
        score: typeof a.score === 'number' ? Math.round(a.score * 100) : null
      }
    })

  return {
    strategy,
    fetchedAt: new Date().toISOString(),
    ok: true,
    categories: categoryItems,
    metrics: metricItems
  }
}

/** 失败占位结果 */
function failedStrategy(strategy: 'mobile' | 'desktop', error: string): PageSpeedStrategyResult {
  return { strategy, fetchedAt: new Date().toISOString(), ok: false, error: error.slice(0, 300), categories: [], metrics: [] }
}

/**
 * 调用 Google PageSpeed Insights API（无需 API Key；匿名配额有限，失败时返回错误结果）。
 */
async function fetchViaPsiApi(url: string): Promise<PageSpeedStrategyResult[]> {
  const base = new URL(PSI_ENDPOINT)
  base.searchParams.set('url', url)
  for (const cat of PSI_CATEGORIES) base.searchParams.append('category', cat)

  const run = async (strategy: 'mobile' | 'desktop'): Promise<PageSpeedStrategyResult> => {
    const u = new URL(base.toString())
    u.searchParams.set('strategy', strategy)
    try {
      const res = await fetch(u.toString(), { signal: AbortSignal.timeout(120_000) })
      const json = (await res.json().catch(() => null)) as Record<string, unknown> | null
      const lhr = json?.lighthouseResult as Record<string, unknown> | undefined
      if (!res.ok || !lhr) {
        const err = (json?.error as { message?: string } | undefined)?.message
        return failedStrategy(strategy, err ?? `HTTP ${res.status}`)
      }
      return parseLighthouseResult(strategy, lhr)
    } catch (e) {
      return failedStrategy(strategy, (e as Error).message)
    }
  }

  const mobile = await run('mobile')
  const desktop = await run('desktop')
  return [mobile, desktop]
}

/**
 * 获取 PageSpeed 评分（移动端 + 桌面端），数据来自 Google PSI 在线接口。
 */
export async function fetchPageSpeed(url: string): Promise<PageSpeedReportData> {
  const report: PageSpeedReportData = { fetchedAt: new Date().toISOString(), mobile: null, desktop: null }
  const results = await fetchViaPsiApi(url)
  const ok = results.filter((r) => r.ok)

  if (ok.length > 0) {
    report.mobile = ok.find((r) => r.strategy === 'mobile') ?? failedStrategy('mobile', '移动端评分获取失败')
    report.desktop = ok.find((r) => r.strategy === 'desktop') ?? failedStrategy('desktop', '桌面端评分获取失败')
  } else {
    const firstErr = results.find((r) => r.error)?.error
    report.mobile = failedStrategy('mobile', firstErr ?? 'PageSpeed 评分获取失败')
    report.desktop = failedStrategy('desktop', firstErr ?? 'PageSpeed 评分获取失败')
  }

  return report
}
