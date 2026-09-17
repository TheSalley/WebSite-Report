import type { Page } from 'playwright'
import type { PageSnapshot } from './types'

/** 采集页面快照：页面已加载完成后提取全部原始数据（不进行导航） */
export async function captureSnapshot(page: Page): Promise<PageSnapshot> {
  const finalUrl = page.url()

  // 等待少量时间让 LCP / 附加资源完成
  await page.waitForTimeout(600)

  // 收集性能指标（通过 performance API）
  const perf = await page
    .evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
      const lcpEntry = performance
        .getEntriesByType('largest-contentful-paint')
        .pop() as PerformanceEntry | undefined
      return {
        ttfb: nav ? Math.round(nav.responseStart - nav.requestStart) : 0,
        domContentLoaded: nav ? Math.round(nav.domContentLoadedEventEnd - nav.requestStart) : 0,
        load: nav ? Math.round(nav.loadEventEnd - nav.requestStart) : 0,
        lcp: lcpEntry ? Math.round(lcpEntry.startTime) : 0
      }
    })
    .catch(() => ({ ttfb: 0, domContentLoaded: 0, load: 0, lcp: 0 }))

  // 收集 DOM 结构化数据
  const dom = await page
    .evaluate(() => {
      const text = (el: Element | null): string => (el ? el.textContent?.trim() ?? '' : '')

      const metas: Record<string, string> = {}
      document.querySelectorAll('meta').forEach((m) => {
        const name = (m.getAttribute('name') || m.getAttribute('property') || '').toLowerCase()
        const content = m.getAttribute('content') || ''
        if (name && content) metas[name] = content
      })

      const links: Record<string, string> = {}
      document.querySelectorAll('link').forEach((l) => {
        const rel = (l.getAttribute('rel') || '').toLowerCase()
        const href = l.getAttribute('href') || ''
        if (rel && href) links[rel] = href
      })

      const ogTags: Record<string, string> = {}
      document.querySelectorAll('meta[property^="og:"]').forEach((m) => {
        const prop = (m.getAttribute('property') || '').toLowerCase()
        const content = m.getAttribute('content') || ''
        if (prop && content) ogTags[prop] = content
      })

      const h1s = Array.from(document.querySelectorAll('h1')).map((h) => h.textContent?.trim() ?? '')
      const allHrefs = Array.from(document.querySelectorAll('a[href]'))
        .map((a) => a.getAttribute('href') || '')
        .filter((h) => h && !h.startsWith('#') && !h.startsWith('javascript:'))

      return {
        title: document.title,
        metas,
        links,
        ogTags,
        h1s,
        allHrefs,
        bodyText: text(document.body),
        hasViewport: !!document.querySelector('meta[name="viewport"]'),
        charset: (document.characterSet || '').toLowerCase()
      }
    })
    .catch(() => ({
      title: '',
      metas: {},
      links: {},
      ogTags: {},
      h1s: [],
      allHrefs: [],
      bodyText: '',
      hasViewport: false,
      charset: ''
    }))

  // 网络数据（由 attachNetworkCollector 填充）
  const network = page.__snapshotNetwork ?? {
    totalBytes: 0,
    requestCount: 0,
    responseHeaders: {},
    mainResponseHeaders: {},
    mainStatus: 0,
    consoleErrors: [],
    mixedContents: [],
    requests: []
  }

  return {
    finalUrl,
    title: dom.title,
    metas: dom.metas,
    links: dom.links,
    ogTags: dom.ogTags,
    h1s: dom.h1s,
    allHrefs: dom.allHrefs,
    bodyText: dom.bodyText,
    hasViewport: dom.hasViewport,
    charset: dom.charset,
    perf,
    network
  }
}
