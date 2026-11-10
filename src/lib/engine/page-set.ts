import { newPage } from './browser'
import { logInfo, logWarn } from '../logger'
import type { SitemapContentCounts } from '../types'

export interface PageInfo {
  url: string
  templateSignature: string
}

export interface PageSetResult {
  /** 枚举到的 sitemap URL 列表 */
  sitemaps: string[]
  /** 候选/内容链接数量（含主页；未生成代表页时即 contentPages 数量） */
  candidateCount: number
  /** sitemap 中提取到的全部 URL 总数（含 taxonomy、用户等其他类型） */
  locTotal: number
  /** 页面/新闻/产品数量（taxonomy、用户、其他 CPT 不计入） */
  contentCounts: SitemapContentCounts
  /** 页面/新闻/产品的全部链接（按 sitemap 顺序去重，主页始终在首位） */
  contentPages: string[]
  /** 去重后的代表页（主页优先；仅来自页面/新闻/产品 sitemap） */
  pages: PageInfo[]
}

export interface BuildPageSetOptions {
  signal?: { cancelled: boolean }
  /** 分类进度回调（已分类数/总数/当前 URL） */
  onClassify?: (done: number, total: number, url: string) => void
  /** 最多分类候选页数（默认 40） */
  maxCandidates?: number
  /** 最多代表页数（默认 25） */
  maxRepresentatives?: number
  /** 最多逐页检查的内容链接数（默认 500，可用 WSR_MAX_CONTENT_PAGES 覆盖） */
  maxContentPages?: number
  /** 是否分类候选页并生成模板代表页（默认 true；仅需 contentPages 时可关闭） */
  collectRepresentatives?: boolean
}

const MAX_CANDIDATES = 40
const MAX_REPRESENTATIVES = 25
const MAX_CONTENT_PAGES = 500
const FETCH_TIMEOUT = 10_000

/** WordPress 核心 sitemap 路径 */
export const WP_SITEMAP_PATH = '/wp-sitemap.xml'

export type SitemapFetch = (url: string) => Promise<string>

/** 内容链接上限：默认 500，可通过环境变量调整 */
function contentPageLimit(): number {
  const raw = Number(process.env.WSR_MAX_CONTENT_PAGES)
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : MAX_CONTENT_PAGES
}

/** 主机归一化：去 www 前缀、localhost 与 127.0.0.1 视为等价（用于同站判断与去重键） */
function normHost(hostname: string): string {
  const h = hostname.toLowerCase().replace(/^\./, '').replace(/^www\./, '')
  if (h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '::1') return '127.0.0.1'
  return h
}

function isSameSite(raw: string, origin: string): boolean {
  try {
    const u = new URL(raw)
    const o = new URL(origin)
    if (u.protocol !== o.protocol || u.port !== o.port) return false
    return normHost(u.hostname) === normHost(o.hostname)
  } catch {
    return false
  }
}

function normUrl(u: string): string {
  try {
    const x = new URL(u)
    x.hash = ''
    x.search = ''
    x.hostname = normHost(x.hostname)
    return x.toString().replace(/\/+$/, '')
  } catch {
    return u
  }
}

/** 将同站 URL 的协议/主机/端口对齐到站点基址（www/localhost 差异归一，报告展示一致） */
function alignHost(raw: string, origin: string): string {
  try {
    const o = new URL(origin)
    const u = new URL(raw)
    u.protocol = o.protocol
    u.host = o.host
    return u.toString()
  } catch {
    return raw
  }
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(FETCH_TIMEOUT) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text()
}

export function extractLocs(text: string): string[] {
  const out: string[] = []
  // 兼容普通 <loc> 与 CDATA 包裹（AIOSEO 等插件输出 <![CDATA[url]]>）两种形式
  const re = /<loc>\s*([\s\S]*?)\s*<\/loc>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const raw = m[1].trim().replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim()
    if (raw) out.push(raw.replace(/&amp;/g, '&'))
  }
  return out
}

/** 站点统一使用 WordPress 核心 sitemap，不再读取 robots.txt */
export function getSitemapUrls(origin: string): string[] {
  return [origin + WP_SITEMAP_PATH]
}

export interface SitemapGroup {
  /** 子 sitemap 地址（用于识别页面/新闻/产品类型） */
  url: string
  /** 该 sitemap 中提取到的 URL */
  locs: string[]
}

export type SitemapContentKind = 'page' | 'post' | 'product' | 'other'

function sitemapFileName(url: string): string {
  try {
    return (new URL(url).pathname.split('/').filter(Boolean).pop() ?? '').toLowerCase()
  } catch {
    return url.toLowerCase()
  }
}

/** 从 sitemap 文件名解析 post type：兼容 WP 核心与 Yoast/Rank Math 两种命名 */
function sitemapPostType(url: string): string {
  const name = sitemapFileName(url)
  // WP 核心：wp-sitemap-posts-page-1.xml / wp-sitemap-posts-product-2.xml
  const core = /^wp-sitemap-posts-(.+?)-\d+\.xml$/i.exec(name)
  if (core) return core[1].toLowerCase()
  // Yoast / Rank Math：page-sitemap.xml / post-sitemap2.xml / product-sitemap.xml
  const plugin = /^(.+?)-sitemap\d*\.xml$/i.exec(name)
  if (plugin) return plugin[1].toLowerCase()
  return ''
}

const PAGE_POST_TYPES = new Set(['page', 'pages'])
const NEWS_POST_TYPES = new Set(['post', 'posts', 'news', 'blog'])
const PRODUCT_POST_TYPES = new Set(['product', 'products'])

/** 识别 sitemap 类型：只关心页面、新闻（post）、产品，其余归为 other */
export function classifySitemap(url: string): SitemapContentKind {
  const type = sitemapPostType(url)
  if (PAGE_POST_TYPES.has(type)) return 'page'
  if (NEWS_POST_TYPES.has(type)) return 'post'
  if (PRODUCT_POST_TYPES.has(type)) return 'product'
  return 'other'
}

/** 只统计页面、新闻（post）、产品；分类/用户/其他 CPT 不计入 */
export function countSitemapContent(groups: SitemapGroup[]): SitemapContentCounts {
  const counts: SitemapContentCounts = { pages: 0, posts: 0, products: 0 }
  const seen: Record<'page' | 'post' | 'product', Set<string>> = {
    page: new Set(),
    post: new Set(),
    product: new Set()
  }
  for (const group of groups) {
    const kind = classifySitemap(group.url)
    if (kind === 'other') continue
    const dedupe = seen[kind]
    for (const loc of group.locs) {
      const key = normUrl(loc)
      if (dedupe.has(key)) continue
      dedupe.add(key)
      if (kind === 'page') counts.pages++
      else if (kind === 'post') counts.posts++
      else counts.products++
    }
  }
  return counts
}

export async function collectSitemapGroups(
  sitemapUrls: string[],
  depth = 0,
  fetchImpl: SitemapFetch = fetchText
): Promise<SitemapGroup[]> {
  const groups: SitemapGroup[] = []
  for (const sm of sitemapUrls) {
    let text = ''
    try {
      text = await fetchImpl(sm)
    } catch {
      continue
    }
    const locs = extractLocs(text)
    if (depth === 0 && /<sitemapindex/i.test(text)) {
      groups.push(...(await collectSitemapGroups(locs, 1, fetchImpl)))
    } else {
      groups.push({ url: sm, locs })
    }
  }
  return groups
}

/** 访问单个页面，返回其模板签名（失败返回 'load-failed'；最多重试 1 次） */
async function classifyOnce(url: string): Promise<PageInfo> {
  const page = await newPage()
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 })
    const sig = await page
      .evaluate(() => {
        const cls = Array.from(document.body?.classList ?? [])
          .filter((c) => c && !/^(?:(?:postid|attachment|product-id|page|post)-\d+|(?:category|tag|term|tax)-|slug-)/.test(c))
          .sort()
        return cls.length ? cls.join(' ') : 'body'
      })
      .catch(() => '')
    return { url: page.url(), templateSignature: sig }
  } catch {
    return { url, templateSignature: 'load-failed' }
  } finally {
    await page.context().close().catch(() => undefined)
  }
}

async function classifyPage(url: string): Promise<PageInfo> {
  let info = await classifyOnce(url)
  if (info.templateSignature === 'load-failed') info = await classifyOnce(url)
  return info
}

/**
 * 构建检测页面集合：
 * 1. 从 wp-sitemap.xml 枚举整站 URL，收集页面/新闻/产品的全部内容链接
 * 2. H1、隐藏板块等逐页检查规则直接使用 contentPages
 * 3. 需要模板代表页时，访问候选页采集 body class 签名并按模板去重
 */
export async function buildPageSet(baseUrl: string, opts: BuildPageSetOptions = {}): Promise<PageSetResult> {
  const signal = opts.signal
  const maxCandidates = opts.maxCandidates ?? MAX_CANDIDATES
  const maxReps = opts.maxRepresentatives ?? MAX_REPRESENTATIVES
  const collectRepresentatives = opts.collectRepresentatives !== false
  const maxContentPages = opts.maxContentPages ?? contentPageLimit()

  let origin = ''
  try {
    origin = new URL(baseUrl).origin
  } catch {
    logWarn(`站点 URL 无效，仅检测主页：${baseUrl}`)
    return {
      sitemaps: [],
      candidateCount: 1,
      locTotal: 0,
      contentCounts: { pages: 0, posts: 0, products: 0 },
      contentPages: [baseUrl],
      pages: [{ url: baseUrl, templateSignature: '' }]
    }
  }

  // 1) 枚举 wp-sitemap.xml：contentPages 收集页面/新闻/产品的全部链接，代表页从候选中按模板去重
  const candidates: string[] = [baseUrl]
  const seen = new Set<string>([normUrl(baseUrl)])
  const contentPages: string[] = [baseUrl]
  const contentSeen = new Set<string>([normUrl(baseUrl)])
  let skippedContent = 0
  let sitemaps: string[] = []
  let locTotal = 0
  let contentCounts: SitemapContentCounts = { pages: 0, posts: 0, products: 0 }
  try {
    sitemaps = getSitemapUrls(origin)
    const groups = await collectSitemapGroups(sitemaps)
    locTotal = groups.reduce((n, g) => n + g.locs.length, 0)
    contentCounts = countSitemapContent(groups)
    // H1 / Elementor 等检测只使用页面、新闻、产品这三类 sitemap 的链接
    const contentGroups = groups.filter((g) => classifySitemap(g.url) !== 'other')
    for (const g of contentGroups) {
      for (const raw of g.locs) {
        if (!isSameSite(raw, origin)) continue
        const url = alignHost(raw, origin)
        const key = normUrl(url)
        if (!key || contentSeen.has(key)) continue
        contentSeen.add(key)
        if (contentPages.length >= maxContentPages) {
          skippedContent++
          continue
        }
        contentPages.push(url)
      }
    }
    if (skippedContent > 0) {
      logWarn(
        `内容链接超过 ${maxContentPages} 个上限，剩余 ${skippedContent} 个未逐页检查（可用 WSR_MAX_CONTENT_PAGES 调整）`
      )
    }
    if (collectRepresentatives) {
      let round = 0
      outer: while (candidates.length < maxCandidates) {
        let added = 0
        for (const g of contentGroups) {
          if (round >= g.locs.length) continue
          const raw = g.locs[round]
          if (!isSameSite(raw, origin)) continue
          const url = alignHost(raw, origin)
          const key = normUrl(url)
          if (key && !seen.has(key)) {
            seen.add(key)
            candidates.push(url)
            added++
            if (candidates.length >= maxCandidates) break outer
          }
        }
        if (added === 0) break
        round++
      }
    }
    logInfo(
      `sitemap 枚举：${sitemaps.length} 个 sitemap，共 ${locTotal} 个 URL（页面 ${contentCounts.pages}、新闻 ${contentCounts.posts}、产品 ${contentCounts.products}；逐页检查链接 ${contentPages.length} 个）`
    )
  } catch (e) {
    logWarn(`sitemap 枚举失败，仅检测主页：${(e as Error).message}`)
  }

  // 2) 分类：访问候选页取模板签名（仅需要代表页时执行，避免 H1/隐藏板块任务多访问页面）
  const infos: PageInfo[] = []
  if (collectRepresentatives) {
    for (let i = 0; i < candidates.length; i++) {
      if (signal?.cancelled) break
      infos.push(await classifyPage(candidates[i]))
      opts.onClassify?.(i + 1, candidates.length, candidates[i])
    }
  }

  // 3) 按模板签名去重（主页优先；load-failed 只保留 1 个以提示问题，避免重复占位）
  const reps: PageInfo[] = []
  const sigSeen = new Set<string>()
  let loadFailedKept = false
  for (const info of infos) {
    if (reps.length >= maxReps) break
    const sig = info.templateSignature || 'load-failed'
    if (sig === 'load-failed') {
      if (loadFailedKept) continue
      loadFailedKept = true
      reps.push(info)
      continue
    }
    if (sigSeen.has(sig)) continue
    sigSeen.add(sig)
    reps.push(info)
  }

  if (!collectRepresentatives) {
    logInfo(`页面集合：仅需逐页检查，跳过模板分类（内容链接 ${contentPages.length} 个）`)
  } else if (reps.length < infos.length) {
    logWarn(`模板去重：候选 ${infos.length} 页 → 代表页 ${reps.length} 页`)
  } else {
    logInfo(`页面集合：${reps.length} 个代表页（候选 ${infos.length}）`)
  }
  return {
    sitemaps,
    candidateCount: collectRepresentatives ? candidates.length : contentPages.length,
    locTotal,
    contentCounts,
    contentPages,
    pages: reps
  }
}
