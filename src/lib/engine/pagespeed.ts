import { spawn, type ChildProcess } from 'child_process'
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { chromium } from 'playwright'
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

/** 拉起的独立 Lighthouse 浏览器进程（用于清理） */
let lhBrowserProc: ChildProcess | null = null
let lhProfileDir: string | null = null

/** 清理 Lighthouse 专用浏览器进程与临时目录 */
function cleanupLhBrowser(): void {
  if (lhBrowserProc) {
    try {
      lhBrowserProc.kill()
    } catch {
      /* 忽略 */
    }
    lhBrowserProc = null
  }
  if (lhProfileDir) {
    setTimeout(() => {
      try {
        rmSync(lhProfileDir!, { recursive: true, force: true, maxRetries: 5 })
      } catch {
        /* 忽略 */
      }
      lhProfileDir = null
    }, 500)
  }
}

/** 等待 DevToolsActivePort 文件出现并返回端口 */
async function waitForDevToolsPort(profileDir: string, timeoutMs = 20_000): Promise<number> {
  const portFile = join(profileDir, 'DevToolsActivePort')
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    try {
      if (existsSync(portFile)) {
        const content = readFileSync(portFile, 'utf8').split('\n')
        const port = parseInt(content[0]?.trim() ?? '', 10)
        if (port > 0) return port
      }
    } catch {
      /* 文件可能正在写 */
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error('无法获取浏览器调试端口')
}

/** 拉一个独立的 headless Chromium 供 Lighthouse 使用（复用 Playwright 浏览器可执行文件） */
async function launchLhBrowser(): Promise<{ port: number; done: () => void }> {
  const chromePath = chromium.executablePath()
  if (!chromePath) throw new Error('未找到可用的 Chromium 可执行文件')
  const profileDir = mkdtempSync(join(tmpdir(), 'lh-profile-'))
  const proc = spawn(
    chromePath,
    [
      '--no-sandbox',
      '--headless=new',
      '--remote-debugging-port=0',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      `--user-data-dir=${profileDir}`,
      'about:blank'
    ],
    { stdio: 'ignore', windowsHide: true }
  )
  lhBrowserProc = proc
  lhProfileDir = profileDir

  const port = await waitForDevToolsPort(profileDir)
  // 等 CDP 可用
  for (let i = 0; i < 30; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`)
      if (r.ok) break
    } catch {
      /* 未就绪 */
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  return { port, done: cleanupLhBrowser }
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
    done()
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
  cleanupLhBrowser()
}


