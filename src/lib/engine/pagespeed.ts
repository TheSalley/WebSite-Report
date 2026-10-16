import { createServer } from 'net'
import { ensurePlaywrightBrowsersPath } from './playwright-path'
import type { Browser } from 'playwright'

ensurePlaywrightBrowsersPath()
import { getSettings } from '../store'
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
 * 从 Lighthouse JSON 结果（PSI API 或本地 lighthouse 返回的 lhr）中提取评分与核心指标。
 * 两个通道的 lhr 结构一致（都是 Lighthouse 产物）。
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
 * 通道 1：Google PageSpeed Insights API（需要有效 API Key）。
 * 匿名共享配额基本不可用（429），仅当配置了 Key 时尝试。
 */
async function fetchViaPsiApi(url: string, apiKey: string): Promise<PageSpeedStrategyResult[] | null> {
  const base = new URL(PSI_ENDPOINT)
  base.searchParams.set('url', url)
  for (const cat of PSI_CATEGORIES) base.searchParams.append('category', cat)
  base.searchParams.set('key', apiKey.trim())

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
  if (!mobile.ok && !desktop.ok) return null
  return [mobile, desktop]
}

/** 找一个空闲 TCP 端口用于 Chrome 调试 */
function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, () => {
      const addr = server.address()
      const port = typeof addr === 'object' && addr !== null ? addr.port : 0
      server.close(() => resolve(port))
    })
  })
}

/** 拉起的 Lighthouse 专用浏览器实例（用于清理） */
let lhBrowser: Browser | null = null

/** 清理 Lighthouse 专用浏览器 */
async function cleanupLhBrowser(): Promise<void> {
  if (lhBrowser) {
    await lhBrowser.close().catch(() => undefined)
    lhBrowser = null
  }
}

/**
 * 用 Playwright 启动 headless Chromium 供 Lighthouse 使用。
 *
 * 之前用裸 spawn 启动 Chrome，在 www 等受限用户下 crashpad 崩溃导致
 * “无法获取浏览器调试端口”；Playwright 自带完整启动参数（已验证可正常启动），
 * 这里直接复用 Playwright launch，并通过固定 CDP 端口让 Lighthouse 连接。
 */
async function launchLhBrowser(): Promise<{ port: number; done: () => Promise<void> }> {
  const port = await getFreePort()
  const chromium = (await import('playwright')).chromium
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-default-apps',
      `--remote-debugging-port=${port}`
    ]
  })
  lhBrowser = browser

  // 等待 CDP 可用（固定端口已知，轮询 /json/version）
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`)
      if (r.ok) return { port, done: cleanupLhBrowser }
    } catch {
      /* 未就绪，继续等 */
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  await cleanupLhBrowser().catch(() => undefined)
  throw new Error('无法获取浏览器调试端口')
}

/**
 * 通道 2：本地 Lighthouse + 内置 headless Chromium（离线可用，与 pagespeed.dev 同源算法）。
 */
async function fetchViaLocalLighthouse(url: string): Promise<PageSpeedStrategyResult[]> {
  const results: PageSpeedStrategyResult[] = []
  const { port, done } = await launchLhBrowser()
  try {
    // lighthouse 类型庞大且与项目无强耦合，这里按需取用 lhr 字段
    const mod = (await import('lighthouse')) as unknown as {
      default: (url: string, flags: Record<string, unknown>) => Promise<{ lhr?: unknown } | undefined>
    }
    const lighthouse = mod.default
    for (const strategy of ['mobile', 'desktop'] as const) {
      try {
        const flags: Record<string, unknown> = {
          port,
          output: 'json',
          onlyCategories: PSI_CATEGORIES,
          formFactor: strategy,
          screenEmulation:
            strategy === 'mobile'
              ? { mobile: true, width: 390, height: 844, deviceScaleFactor: 2 }
              : { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1 },
          logLevel: 'error',
          maxWaitForFcp: 45_000,
          maxWaitForLoad: 60_000
        }
        const runner = await lighthouse(url, flags)
        if (!runner?.lhr) throw new Error('Lighthouse 未返回结果')
        results.push(parseLighthouseResult(strategy, runner.lhr))
      } catch (e) {
        results.push(failedStrategy(strategy, (e as Error).message))
      }
    }
  } finally {
    await done()
  }
  return results
}

/**
 * 获取 PageSpeed 评分（移动端 + 桌面端）。
 * 策略：配置了 PSI API Key 时优先用 API；否则/失败时回退本地 Lighthouse（离线可用）。
 */
export async function fetchPageSpeed(url: string): Promise<PageSpeedReportData> {
  const settings = await getSettings()
  const psiApiKey = settings['report.psiApiKey'] ?? ''
  const report: PageSpeedReportData = { fetchedAt: new Date().toISOString(), mobile: null, desktop: null }

  let results: PageSpeedStrategyResult[] | null = null
  if (psiApiKey?.trim()) {
    results = await fetchViaPsiApi(url, psiApiKey)
  }
  if (!results?.some((r) => r.ok)) {
    results = await fetchViaLocalLighthouse(url)
  }

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

/** 清理 Lighthouse 残留进程 */
export function shutdownPagespeed(): void {
  void cleanupLhBrowser()
}


