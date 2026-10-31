import { newPage } from './browser'
import { logInfo, logWarn } from '../logger'

export interface PageInfo {
  url: string
  templateSignature: string
}

export interface PageSetResult {
  /** 枚举到的 sitemap URL 列表 */
  sitemaps: string[]
  /** 候选项数量（含主页） */
  candidateCount: number
  /** sitemap 中提取到的全部 URL 总数 */
  locTotal: number
  /** 去重后的代表页（主页优先） */
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
}

const MAX_CANDIDATES = 40
const MAX_REPRESENTATIVES = 25
const FETCH_TIMEOUT = 10_000

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

export async function discoverSitemapUrls(origin: string): Promise<string[]> {
  const found: string[] = []
  try {
    const robots = await fetchText(`${origin}/robots.txt`)
    for (const line of robots.split(/\r?\n/)) {
      const m = /^\s*[Ss]itemap:\s*(\S+)\s*$/.exec(line)
      if (m) found.push(m[1])
    }
  } catch {
    // 无 robots.txt 时尝试常见 sitemap 路径
  }
  if (found.length === 0) {
    for (const p of ['/sitemap.xml', '/sitemap_index.xml']) {
      try {
        const text = await fetchText(origin + p)
        if (extractLocs(text).length > 0) {
          found.push(origin + p)
          break
        }
      } catch {
        // 继续尝试下一个路径
      }
    }
  }
  return found
}

export async function collectSitemapLocsGrouped(sitemapUrls: string[], depth = 0): Promise<string[][]> {
  const groups: string[][] = []
  for (const sm of sitemapUrls) {
    let text = ''
    try {
      text = await fetchText(sm)
    } catch {
      continue
    }
    const locs = extractLocs(text)
    if (depth === 0 && /<sitemapindex/i.test(text)) {
      groups.push(...(await collectSitemapLocsGrouped(locs, 1)))
    } else {
      groups.push(locs)
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
 * 1. 从 robots.txt / sitemap 枚举整站 URL
 * 2. 逐一访问候选页采集模板签名（过滤实例噪音后的 body class）
 * 3. 按模板签名去重，主页始终保留，返回代表页集合
 */
export async function buildPageSet(baseUrl: string, opts: BuildPageSetOptions = {}): Promise<PageSetResult> {
  const signal = opts.signal
  const maxCandidates = opts.maxCandidates ?? MAX_CANDIDATES
  const maxReps = opts.maxRepresentatives ?? MAX_REPRESENTATIVES

  let origin = ''
  try {
    origin = new URL(baseUrl).origin
  } catch {
    logWarn(`站点 URL 无效，仅检测主页：${baseUrl}`)
    return { sitemaps: [], candidateCount: 1, locTotal: 0, pages: [{ url: baseUrl, templateSignature: '' }] }
  }

  // 1) 枚举候选页（主页优先）：跨 sitemap 组轮询取样，保证新闻/产品/独立页面等模板都有代表
  const candidates: string[] = [baseUrl]
  const seen = new Set<string>([normUrl(baseUrl)])
  let sitemaps: string[] = []
  let locTotal = 0
  try {
    sitemaps = await discoverSitemapUrls(origin)
    const groups = await collectSitemapLocsGrouped(sitemaps)
    locTotal = groups.reduce((n, g) => n + g.length, 0)
    let round = 0
    outer: while (candidates.length < maxCandidates) {
      let added = 0
      for (const g of groups) {
        if (round >= g.length) continue
        const raw = g[round]
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
    logInfo(`sitemap 枚举：${sitemaps.length} 个 sitemap，共 ${locTotal} 个 URL`)
  } catch (e) {
    logWarn(`sitemap 枚举失败，仅检测主页：${(e as Error).message}`)
  }

  // 2) 分类：访问候选页取模板签名
  const infos: PageInfo[] = []
  for (let i = 0; i < candidates.length; i++) {
    if (signal?.cancelled) break
    infos.push(await classifyPage(candidates[i]))
    opts.onClassify?.(i + 1, candidates.length, candidates[i])
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

  if (reps.length < infos.length) {
    logWarn(`模板去重：候选 ${infos.length} 页 → 代表页 ${reps.length} 页`)
  } else {
    logInfo(`页面集合：${reps.length} 个代表页（候选 ${infos.length}）`)
  }
  return { sitemaps, candidateCount: candidates.length, locTotal, pages: reps }
}