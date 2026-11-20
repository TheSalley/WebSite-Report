import { readFile } from 'fs/promises'
import { join } from 'path'
import { DATA_DIR, getTask, getSite, getRuleSet, listCheckResults, listRulesForSet } from '../store'
import { getReportSettings } from '../settings'
import { DELIVERABLE_PRESETS, CONTRACT_REPORT_ITEMS } from '../seed'
import { getBrowser } from '../engine/browser'
import { describeElementorItem } from '../engine/rules/delivery'
import { displayUrl, pageLabel } from '../display'

import type { CheckResult, ReportSettings, Site, RuleSet, Task, SiteDataByRuleKey } from '../types'
import { resultKind } from '../rule-kinds'

/** 站点级汇总规则：失败时在问题清单中按一条结果展示 */
const SITE_SUMMARY_RULE_KEYS = new Set(['seo.noindex.disabled', 'seo.site.title-favicon'])

/** 报告数据（含截图 dataURL） */
export interface ReportData {
  task: Task
  site: Site
  ruleSet: RuleSet
  results: (CheckResult & { screenshotDataUrl: string | null })[]
  generatedAt: string
  passCount: number
  warnCount: number
  failCount: number
  skipCount: number
  verifyCount: number
  settings: ReportSettings
  /** PageSpeed 页面截图（移动端/桌面端 dataURL） */
  pagespeedShots: { strategy: string; dataUrl: string | null }[]
  /** 检测页面集合（sitemap 枚举 + 模板去重结果） */
  pageSet: import('../types').TaskPageSet | null
  /** 站点级规则的结构化数据（按 ruleKey 类型化，含交付检查逐页明细） */
  siteData: SiteDataByRuleKey | null
  /** 板块展示顺序（按规则集定义） */
  groupOrder: Record<string, number>
}

/** ISO 时间 → 本地可读时间（YYYY-MM-DD HH:mm），空值/异常显示 — */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

const LOGO_MIME: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp'
}

/** 将报告 LOGO 配置解析为内嵌 data URL（支持 data:、public 路径、绝对路径） */
async function resolveLogoDataUrl(logoPath: string): Promise<string | null> {
  if (!logoPath) return null
  if (logoPath.startsWith('data:')) return logoPath
  try {
    const full = logoPath.startsWith('/') ? join(process.cwd(), 'public', logoPath) : logoPath
    const buffer = await readFile(full)
    const ext = (logoPath.toLowerCase().match(/(\.[a-z0-9]+)(?:\?|$)/) ?? [])[1] ?? '.png'
    const mime = LOGO_MIME[ext] ?? 'image/png'
    return `data:${mime};base64,${buffer.toString('base64')}`
  } catch {
    return null
  }
}

/** HTML 转义，防 XSS */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** 长值按顿号分组折行，避免一长串页面路径把单元格撑得很宽 */
function wrapListValue(value: string, maxLen = 44): string[] {
  if (value.length <= maxLen || !value.includes('、')) return [value]
  const out: string[] = []
  let line = ''
  for (const item of value.split('、')) {
    const next = line ? `${line}、${item}` : item
    if (line && next.length > maxLen) {
      out.push(`${line}、`)
      line = item
    } else {
      line = next
    }
  }
  if (line) out.push(line)
  return out
}

/**
 * 交付检查「内容说明」排版：按中文分句拆行，标签与长链接（URL/路径）分行，
 * 避免整段说明挤成一长行、长 URL 无法换行把表格撑开。
 */
function formatDeliveryDescription(raw: string | null | undefined): string[] {
  const text = (raw ?? '').trim()
  if (!text) return []
  const lines: string[] = []
  for (const clause of text.split(/(?<=[；;。])/)) {
    const piece = clause.replace(/[；;。]$/, '').trim()
    if (!piece) continue
    const m = piece.match(/^([^：:]{1,24})[：:](.+)$/)
    const value = m?.[2]?.trim() ?? ''
    if (m && (value.length > 12 || /^(https?:|\/|www\.)/i.test(value))) {
      lines.push(`${m[1]}：`)
      lines.push(...wrapListValue(value))
    } else {
      lines.push(...wrapListValue(piece))
    }
  }
  return lines
}

/** 从旧任务 actualValue 解析 Title / Favicon（形如 Title：“…”；Favicon：https://…） */
function parseSiteMetaText(actual: string | null | undefined): { title: string; faviconUrl: string } {
  const text = (actual ?? '').trim()
  if (!text) return { title: '', faviconUrl: '' }
  const title = text.match(/Title[：:]\s*(?:[“"]([\s\S]*?)[”"])/)?.[1]?.trim() ?? ''
  // 旧数据里的 Favicon 地址可能被截断（结尾 …），截断值不作为图片地址
  const faviconRaw = text.match(/Favicon[：:]\s*(https?:\/\/[^\s；;]+)/)?.[1]?.trim() ?? ''
  const favicon = faviconRaw.endsWith('…') ? '' : faviconRaw
  return { title, faviconUrl: favicon }
}

interface SiteMetaDisplay {
  title: string
  faviconUrl: string
  faviconDataUrl: string | null
}

/** 站点 Title / Favicon 说明单元格：展示具体标题、favicon 图标与完整地址 */
function siteMetaCellHtml(meta: SiteMetaDisplay): string {
  const empty = '<span class="meta-empty">未配置</span>'
  const titleHtml = meta.title ? `<span class="meta-value">${escapeHtml(meta.title)}</span>` : empty
  const iconSrc = meta.faviconDataUrl ?? meta.faviconUrl
  const iconHtml = iconSrc
    ? `<span class="meta-favicon"><img src="${escapeHtml(iconSrc)}" alt="站点 Favicon" /></span>`
    : ''
  const urlHtml = meta.faviconUrl ? `<span class="meta-link">${escapeHtml(meta.faviconUrl)}</span>` : empty
  const faviconHtml = iconSrc ? `<span class="meta-favicon-row">${iconHtml}${urlHtml}</span>` : urlHtml
  return `<div class="site-meta">
      <div class="site-meta-line"><span class="meta-label">站点 Title：</span>${titleHtml}</div>
      <div class="site-meta-line"><span class="meta-label">站点 Favicon：</span>${faviconHtml}</div>
    </div>`
}

/** 交付检查「内容说明」单元格 HTML（已转义，行间用 <br>） */
function deliveryDescriptionHtml(raw: string | null | undefined): string {
  return formatDeliveryDescription(raw).map((line) => safeReportText(line)).join('<br>')
}

/** 交付检查「交付成果」：只区分有异常 / 无异常 */
function deliveryStatusBadge(status: string): string {
  return status === 'pass'
    ? '<span class="badge badge-pass">无异常</span>'
    : '<span class="badge badge-fail">有异常</span>'
}

/** 常见状态 emoji → 内联 SVG（服务器缺 emoji 字体时 PDF/打印也能正确显示） */
const EMOJI_SVG: ReadonlyArray<readonly [string, string]> = [
  ['✅', '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" style="vertical-align:-2px;display:inline-block" role="img" aria-label="通过"><circle cx="12" cy="12" r="10" fill="#dcfce7" stroke="#16a34a" stroke-width="1.6"/><path d="m8 12.4 2.6 2.6L16.2 9.6" fill="none" stroke="#16a34a" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'],
  ['❌', '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" style="vertical-align:-2px;display:inline-block" role="img" aria-label="失败"><circle cx="12" cy="12" r="10" fill="#fee2e2" stroke="#dc2626" stroke-width="1.6"/><path d="m9 9 6 6M15 9l-6 6" stroke="#dc2626" stroke-width="2.4" stroke-linecap="round"/></svg>'],
  ['⚠️', '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" style="vertical-align:-2px;display:inline-block" role="img" aria-label="警告"><path d="M12 3 2.5 20h19L12 3Z" fill="#fef3c7" stroke="#d97706" stroke-width="1.8" stroke-linejoin="round"/><line x1="12" y1="9.4" x2="12" y2="14" stroke="#d97706" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="17" r="1.3" fill="#d97706"/></svg>'],
  ['⚠', '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" style="vertical-align:-2px;display:inline-block" role="img" aria-label="警告"><path d="M12 3 2.5 20h19L12 3Z" fill="#fef3c7" stroke="#d97706" stroke-width="1.8" stroke-linejoin="round"/><line x1="12" y1="9.4" x2="12" y2="14" stroke="#d97706" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="17" r="1.3" fill="#d97706"/></svg>'],
  ['✔️', '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" style="vertical-align:-2px;display:inline-block" role="img" aria-label="通过"><path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="#16a34a" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'],
  ['✔', '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" style="vertical-align:-2px;display:inline-block" role="img" aria-label="通过"><path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="#16a34a" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'],
  ['✓', '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" style="vertical-align:-2px;display:inline-block" role="img" aria-label="通过"><path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="#16a34a" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'],
  ['✗', '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" style="vertical-align:-2px;display:inline-block" role="img" aria-label="失败"><path d="m6 6 12 12M18 6 6 18" stroke="#dc2626" stroke-width="2.8" stroke-linecap="round"/></svg>'],
  ['☑️', '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" style="vertical-align:-2px;display:inline-block" role="img" aria-label="已勾选"><rect x="3.5" y="3.5" width="17" height="17" rx="3" fill="#dcfce7" stroke="#16a34a" stroke-width="1.8"/><path d="m8 12.4 2.6 2.6L16.2 9.6" fill="none" stroke="#16a34a" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'],
  ['☑', '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" style="vertical-align:-2px;display:inline-block" role="img" aria-label="已勾选"><rect x="3.5" y="3.5" width="17" height="17" rx="3" fill="#dcfce7" stroke="#16a34a" stroke-width="1.8"/><path d="m8 12.4 2.6 2.6L16.2 9.6" fill="none" stroke="#16a34a" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'],
  ['🟢', '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" style="vertical-align:-2px;display:inline-block" role="img" aria-label="正常"><circle cx="12" cy="12" r="10" fill="#22c55e"/></svg>'],
  ['🔴', '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" style="vertical-align:-2px;display:inline-block" role="img" aria-label="异常"><circle cx="12" cy="12" r="10" fill="#ef4444"/></svg>'],
  ['🟡', '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" style="vertical-align:-2px;display:inline-block" role="img" aria-label="提醒"><circle cx="12" cy="12" r="10" fill="#eab308"/></svg>']
]

/** 转义 HTML 并把常见 emoji 替换为内联 SVG（网页与 PDF 显示一致，不依赖服务器 emoji 字体） */
function safeReportText(raw: string | null | undefined): string {
  if (!raw) return ''
  let out = escapeHtml(raw)
  for (const [emoji, svg] of EMOJI_SVG) {
    out = out.split(emoji).join(svg)
  }
  return out.replace(/\n/g, '<br>')
}

/** 远程图标 → data URL（用于 PDF 内嵌；失败返回 null，调用方退回原始 URL） */
const ICON_DATA_URL_CACHE = new Map<string, string | null>()

async function readRemoteImageAsDataUrl(url: string, maxBytes = 2 * 1024 * 1024): Promise<string | null> {
  if (!url) return null
  if (url.startsWith('data:image/')) return url
  if (!/^https?:\/\//i.test(url)) return null
  if (ICON_DATA_URL_CACHE.has(url)) return ICON_DATA_URL_CACHE.get(url) ?? null

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow' })
    if (!res.ok) return null
    const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    if (!type.startsWith('image/')) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length === 0 || buf.length > maxBytes) {
      ICON_DATA_URL_CACHE.set(url, null)
      return null
    }
    const dataUrl = `data:${type};base64,${buf.toString('base64')}`
    if (ICON_DATA_URL_CACHE.size >= 20) ICON_DATA_URL_CACHE.clear()
    ICON_DATA_URL_CACHE.set(url, dataUrl)
    return dataUrl
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** 读取截图文件并转为 data URL */
async function readScreenshotAsDataUrl(relativePath: string | null): Promise<string | null> {
  if (!relativePath) return null
  try {
    const root = join(DATA_DIR, 'screenshots')
    const full = join(root, relativePath)
    if (!full.startsWith(root)) return null
    const buffer = await readFile(full)
    return `data:image/png;base64,${buffer.toString('base64')}`
  } catch {
    return null
  }
}

/** 读取 PageSpeed 报告截图（移动端/桌面端） */
async function readPagespeedShots(taskId: number): Promise<{ strategy: string; dataUrl: string | null }[]> {
  const out: { strategy: string; dataUrl: string | null }[] = []
  for (const strategy of ['mobile', 'desktop'] as const) {
    out.push({ strategy, dataUrl: await readScreenshotAsDataUrl('task-' + taskId + '/pagespeed-' + strategy + '.png') })
  }
  return out
}

/** 组装报告数据 */
export async function buildReportData(taskId: number): Promise<ReportData> {
  const rawTask = await getTask(taskId)
  if (!rawTask) throw new Error('任务不存在')
  const site = (await getSite(rawTask.siteId))!
  const ruleSet = (await getRuleSet(rawTask.ruleSetId))!
  const rules = await listRulesForSet(rawTask.ruleSetId)
  const groupOrder: Record<string, number> = {}
  let groupIndex = 0
  for (const rule of rules) {
    if (!(rule.groupName in groupOrder)) groupOrder[rule.groupName] = groupIndex++
  }

  const task: Task = {
    id: rawTask.id,
    siteId: rawTask.siteId,
    ruleSetId: rawTask.ruleSetId,
    status: rawTask.status,
    passCount: rawTask.passCount,
    warnCount: rawTask.warnCount,
    failCount: rawTask.failCount,
    skipCount: rawTask.skipCount,
    startedAt: rawTask.startedAt,
    finishedAt: rawTask.finishedAt,
    site,
    ruleSet,
    pageSet: rawTask.pageSetJson ? JSON.parse(rawTask.pageSetJson) : null,
    siteData: rawTask.siteDataJson ? JSON.parse(rawTask.siteDataJson) : null
  }

  const rawResults = await listCheckResults(taskId)
  const results = await Promise.all(
    rawResults.map(async (r) => ({
      id: r.id,
      taskId: r.taskId,
      ruleId: r.ruleId,
      ruleKey: r.ruleKey,
      ruleName: r.ruleName,
      groupName: r.groupName,
      kind: r.kind,
      pageUrl: r.pageUrl,
      status: r.status,
      actualValue: r.actualValue,
      expectedValue: r.expectedValue,
      description: r.description,
      deliverable: (r.deliverable && r.deliverable.trim() ? r.deliverable : DELIVERABLE_PRESETS[r.ruleKey] ?? ''),
      screenshotPath: r.screenshotPath,
      note: r.note,
      checkedAt: r.checkedAt,
      screenshotDataUrl: await readScreenshotAsDataUrl(r.screenshotPath)
    }))
  )

  // 通过率只统计机器检测；合同文案独立人工验收；功能产物仅留存证据
  const checkResults = results.filter((r) => resultKind(r) === 'check')
  const passCount = checkResults.filter((r) => r.status === 'pass').length
  const warnCount = checkResults.filter((r) => r.status === 'warn').length
  const failCount = checkResults.filter((r) => r.status === 'fail').length
  const skipCount = results.filter((r) => resultKind(r) !== 'artifact' && r.status === 'skip').length
  const verifyCount = results.filter((r) => resultKind(r) === 'deliverable' && r.status === 'verify').length

  return {
    task,
    site,
    ruleSet,
    results,
    generatedAt: new Date().toLocaleString('zh-CN'),
    passCount,
    warnCount,
    failCount,
    skipCount,
    verifyCount,
    settings: await getReportSettings(),
    pagespeedShots: await readPagespeedShots(taskId),
    pageSet: task.pageSet ?? null,
    siteData: task.siteData ?? null,
    groupOrder
  }
}

/** 生成报告 PDF（服务端 Chromium 渲染，A4 打印样式） */
export async function buildReportPdf(taskId: number): Promise<Buffer> {
  const data = await buildReportData(taskId)
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<title>${escapeHtml(data.settings.reportTitle || '网站检测报告')}</title>
</head>
<body>${await buildReportHtml(data)}</body>
</html>`
  const browser = await getBrowser()
  const page = await browser.newPage()
  const headerTitle = escapeHtml(data.settings.reportTitle || '网站检测报告')
  try {
    await page.setContent(html, { waitUntil: 'networkidle' })
    await page.emulateMedia({ media: 'print' })
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<div style="font-size:9px;color:#888;width:100%;text-align:center;padding:0 10mm 2mm 10mm;">' + headerTitle + '</div>',
      footerTemplate: '<div style="font-size:9px;color:#888;width:100%;text-align:center;padding:2mm 10mm 0 10mm;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
      margin: { top: '14mm', bottom: '16mm', left: '10mm', right: '10mm' }
    })
    return Buffer.from(pdf)
  } finally {
    await page.close()
  }
}

/** 生成报告 HTML —— 合同式表格版式（可打印为 PDF） */
export async function buildReportHtml(data: ReportData): Promise<string> {
  const { site, results, generatedAt, settings, pagespeedShots } = data
  const task = data.task
  const CN = ['一','二','三','四','五','六','七','八','九','十']
  let sectionNo = 3
  const sectionTitle = (title: string) => { const no = sectionNo++; return `<h2 class="section-title">${CN[no - 1] ?? no}、${title}</h2>` }
  const logoDataUrl = settings.logoPath ? await resolveLogoDataUrl(settings.logoPath) : null

  // 站点 Title / Favicon 具体值（旧任务无结构化数据时从 actualValue 回退解析）
  const siteMeta = (data.siteData?.['seo.site.title-favicon'] ?? null) as { title?: string; faviconUrl?: string } | null
  const siteMetaRow = results.find((r) => r.ruleKey === 'seo.site.title-favicon')
  const parsedMeta = siteMetaRow ? parseSiteMetaText(siteMetaRow.actualValue) : { title: '', faviconUrl: '' }
  const siteTitleValue = (siteMeta?.title ?? '').trim() || parsedMeta.title
  const siteFaviconUrl = (siteMeta?.faviconUrl ?? '').trim() || parsedMeta.faviconUrl
  const siteFaviconDataUrl = siteFaviconUrl ? await readRemoteImageAsDataUrl(siteFaviconUrl) : null

  // 检测明细包含机器检测与合同文案；功能产物不进入明细表
  const reportResults = results.filter((r) => resultKind(r) !== 'artifact')
  const isDeliveryReport = reportResults.some((r) => r.ruleKey.startsWith('delivery.') || SITE_SUMMARY_RULE_KEYS.has(r.ruleKey))

  type DetailRow = {
    ruleKey: string
    ruleName: string
    description: string
    deliverable: string
    status: string
    actual: string
    note: string | null
  }

  // 合同报告严格按示例 PDF 的固定条目与顺序；网站交付检查保持检测分组顺序
  let orderedGroups: [string, DetailRow[]][]
  if (isDeliveryReport) {
    const groups = new Map<string, DetailRow[]>()
    for (const r of reportResults) {
      const arr = groups.get(r.groupName) ?? []
      arr.push({
        ruleKey: r.ruleKey,
        ruleName: r.ruleName,
        description: r.description ?? '',
        deliverable: r.deliverable ?? '',
        status: r.status,
        actual: r.actualValue ?? '',
        note: r.note ?? null
      })
      groups.set(r.groupName, arr)
    }
    orderedGroups = Array.from(groups.entries()).sort(
      ([a], [b]) => (data.groupOrder[a] ?? Number.MAX_SAFE_INTEGER) - (data.groupOrder[b] ?? Number.MAX_SAFE_INTEGER)
    )
  } else {
    const groups = new Map<string, DetailRow[]>()
    for (const item of CONTRACT_REPORT_ITEMS) {
      const arr = groups.get(item.groupName) ?? []
      arr.push({
        ruleKey: item.ruleKey,
        ruleName: item.name,
        description: item.description,
        deliverable: item.deliverable,
        status: '',
        actual: '',
        note: null
      })
      groups.set(item.groupName, arr)
    }
    orderedGroups = Array.from(groups.entries())
  }

  // ── 主检测明细表（合同式：板块列逐行同底色，避免跨页丢边框）──
  const mainRows = orderedGroups
    .map(([groupName, groupResults]) =>
      groupResults
        .map((r, idx) => {
          // 板块列不做 rowspan：合并单元格跨页时边框/底色会丢失，改为每行一个同底色单元格
          const firstCell =
            idx === 0
              ? `<td class="group-cell">${escapeHtml(groupName)}<span class="group-count">${groupResults.length} 项</span></td>`
              : '<td class="group-cell group-cell-continued" aria-hidden="true"></td>'
          const noteHtml = r.note ? `<div class="note">备注：${safeReportText(r.note)}</div>` : ''
          const descHtml =
            isDeliveryReport && r.ruleKey === 'seo.site.title-favicon'
              ? siteMetaCellHtml({
                  title: siteTitleValue,
                  faviconUrl: siteFaviconUrl,
                  faviconDataUrl: siteFaviconDataUrl
                })
              : isDeliveryReport
                ? deliveryDescriptionHtml(r.description)
                : r.description
                  ? safeReportText(r.description)
                  : ''
          const deliverCell = isDeliveryReport
            ? deliveryStatusBadge(r.status)
            : r.deliverable && r.deliverable.trim()
              ? `<div class="cell-deliver"><span class="deliver-text">${safeReportText(r.deliverable)}</span></div>`
              : ''
          const rowClass = idx < groupResults.length - 1 ? ' class="group-link"' : ''
          return `<tr${rowClass}>
            ${firstCell}
            <td class="item-cell"><div class="item-name">${escapeHtml(r.ruleName)}</div></td>
            <td class="desc-cell">${descHtml}${noteHtml}</td>
            <td class="deliver-cell">${deliverCell}</td>
          </tr>`
        })
        .join('')
    )
    .join('')

  // ── 检测出的具体错误问题（网站交付检查）──
  const issueRows: { type: string; page: string; problem: string; detail?: string }[] = []
  if (isDeliveryReport) {
    const h1Pages = data.siteData?.['delivery.h1.count']?.pages ?? []
    for (const page of h1Pages) {
      if (page.h1s.length === 1) continue
      issueRows.push({
        type: 'H1 标题',
        page: page.url,
        problem: page.h1s.length === 0 ? '缺少 H1 标题' : `存在 ${page.h1s.length} 个 H1 标题`,
        detail: page.h1s.length > 1 ? page.h1s.slice(0, 5).join(' / ') : undefined
      })
    }
    const elPages = data.siteData?.['delivery.elementor.hidden-both']?.pages ?? []
    for (const page of elPages) {
      if (page.items.length === 0) continue
      issueRows.push({
        type: 'Elementor 隐藏板块',
        page: page.url,
        problem: `发现 ${page.items.length} 个同时隐藏于桌面端和移动端的板块`,
        detail: page.items.slice(0, 5).map(describeElementorItem).join('；') + (page.items.length > 5 ? ` 等 ${page.items.length} 个` : '')
      })
    }
    for (const r of reportResults) {
      const isAggregatedSiteRule =
        r.ruleKey === 'delivery.h1.count' ||
        r.ruleKey === 'delivery.elementor.hidden-both' ||
        SITE_SUMMARY_RULE_KEYS.has(r.ruleKey)
      if (!r.ruleKey.startsWith('delivery.') && !SITE_SUMMARY_RULE_KEYS.has(r.ruleKey)) continue
      if (isAggregatedSiteRule) continue
      if (r.status !== 'fail' && r.status !== 'warn') continue
      issueRows.push({ type: r.ruleName, page: r.pageUrl, problem: r.actualValue || '检测异常', detail: r.description })
    }
    // 旧任务没有逐页数据时，回退到聚合结果中的问题说明
    if (h1Pages.length === 0) {
      const r = reportResults.find((item) => item.ruleKey === 'delivery.h1.count')
      if (r && (r.status === 'fail' || r.status === 'warn')) {
        issueRows.push({ type: r.ruleName, page: r.pageUrl, problem: r.actualValue || '检测异常', detail: r.description })
      }
    }
    if (elPages.length === 0) {
      const r = reportResults.find((item) => item.ruleKey === 'delivery.elementor.hidden-both')
      if (r && (r.status === 'fail' || r.status === 'warn')) {
        issueRows.push({ type: r.ruleName, page: r.pageUrl, problem: r.actualValue || '检测异常', detail: r.description })
      }
    }
    SITE_SUMMARY_RULE_KEYS.forEach((key) => {
      const r = reportResults.find((item) => item.ruleKey === key)
      if (r && (r.status === 'fail' || r.status === 'warn')) {
        issueRows.push({ type: r.ruleName, page: r.pageUrl, problem: r.actualValue || '检测异常', detail: r.description })
      }
    })
  }
  const issueSection = !isDeliveryReport
    ? ''
    : issueRows.length === 0
      ? '<div class="issue-empty">未发现具体错误问题</div>'
      : `<div class="pageset-table-wrap">
      <table class="contract-table main-table issue-table">
        <thead><tr>
          <th style="width:16%">问题类型</th>
          <th style="width:28%">页面</th>
          <th style="width:56%">具体问题</th>
        </tr></thead>
        <tbody>${issueRows
          .map(
            (issue) => `<tr>
          <td class="issue-type">${escapeHtml(issue.type)}</td>
          <td class="issue-page">${escapeHtml(issue.page ? pageLabel(issue.page) : '—')}</td>
          <td class="issue-problem">${safeReportText(issue.problem)}${issue.detail ? `<div class="issue-detail">${safeReportText(issue.detail)}</div>` : ''}</td>
        </tr>`
          )
          .join('')}</tbody>
      </table>
    </div>`

  // ── 截图（仅 PageSpeed 移动端/桌面端页面截图）──
  const shotItems = pagespeedShots.filter((s) => s.dataUrl)
  const screenshotSection =
    shotItems.length === 0
      ? ''
      : `<div class="shot-grid">
      ${shotItems
        .map(
          (s) => `<figure class="shot-item">
        <img src="${s.dataUrl}" alt="PageSpeed ${s.strategy === 'mobile' ? '移动端' : '桌面端'} 得分报告" />
        <figcaption>PageSpeed ${s.strategy === 'mobile' ? '移动端' : '桌面端'} 得分报告</figcaption>
      </figure>`
        )
        .join('')}
    </div>`

  return `<style>
  .report-root, .report-root * { box-sizing: border-box; margin: 0; padding: 0; }
  /* 强制保留背景色与边框（部分 PDF/打印环境默认会剥离背景） */
  .report-root, .report-root * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .report-root { font-family: "Microsoft YaHei", "PingFang SC", "SimSun", "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif; color: #1f2430; background: #f6f8fb; padding: 32px 40px; line-height: 1.65; }
  @media print {
    .report-root { padding: 0; }
    @page { size: A4; }
    /*
     * 跨页表格修复：
     * 1) 去掉 overflow:hidden / border-radius / box-shadow，避免分页时裁掉外框与底色；
     * 2) collapse 在分页边界会丢失单元格边框，改为 separate + 逐格描边；
     * 3) 单元格用 box-decoration-break: clone，保证跨页片段仍绘制背景。
     */
    .report-root .contract-table {
      border-collapse: separate;
      border-spacing: 0;
      border: 0;
      border-top: 0.75pt solid #cfdaea;
      border-left: 0.75pt solid #cfdaea;
      border-radius: 0;
      overflow: visible;
      box-shadow: none;
      break-inside: auto;
    }
    /* 只画右/下边线：相邻单元格不会叠出双线，分页后的续页片段仍保留网格 */
    .report-root .contract-table th,
    .report-root .contract-table td {
      border: 0;
      border-right: 0.75pt solid #cfdaea;
      border-bottom: 0.75pt solid #cfdaea;
      -webkit-box-decoration-break: clone;
      box-decoration-break: clone;
      break-inside: auto;
    }
    .report-root .contract-table td.group-cell { border-right: 1pt solid #cbd6e6; }
    /* 板块列在组内不画横线，跨页后仍是一整块灰色区域 */
    .report-root .main-table tr.group-link td.group-cell { border-bottom: 0; }
    .report-root .pageset-table-wrap,
    .report-root .pageset-box,
    .report-root .matrix-box,
    .report-root .matrix-table { overflow: visible; }
    .report-root .header, .report-root .shot-item, .report-root .issue-empty { break-inside: avoid; }
    .report-root thead { display: table-header-group; }
    .report-root thead th { break-inside: avoid; break-after: avoid; }
    .report-root h2.section-title { break-after: avoid; break-inside: avoid; }
    .report-root .main-table td.group-cell { break-inside: auto; }
    .report-root { background: #fff; }
    .report-root .shot-grid { gap: 12pt; }
    .report-root .shot-item img { height: 200pt; object-fit: contain; background: #fff; }
    .report-root .shot-item figcaption { font-size: 10px; padding-top: 3pt; }
  }
  .report-root h1, .report-root h2, .report-root h3 { margin: 0; font-weight: 700; }

  /* 报告抬头（合同式居中标题） */
  .header { text-align: center; background: #fff; border-radius: 14px; border-top: 4px solid #2563eb; padding: 26px 28px 24px; box-shadow: 0 2px 12px rgba(37,99,235,.06); margin-bottom: 26px; }
  .header h1 { font-size: 24px; letter-spacing: 3px; color: #1e293b; }
  .header .company { margin-top: 6px; font-size: 13px; color: #2563eb; font-weight: 600; }

  h2.section-title { font-size: 15px; font-weight: 700; color: #1e293b; border-left: 4px solid #2563eb; padding-left: 10px; margin: 26px 0 12px; letter-spacing: .5px; }

  /* 通用合同表格 */
  .contract-table { width: 100%; border-collapse: collapse; border: 1px solid #dbe3ef; font-size: 13px; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 1px 6px rgba(15,23,42,.05); }
  .contract-table th, .contract-table td { border: 1px solid #e5eaf3; padding: 8px 11px; text-align: left; vertical-align: middle; }
  .contract-table th { background: #eff4ff; color: #1d4ed8; font-weight: 700; text-align: center; white-space: nowrap; letter-spacing: .3px; }
  .contract-table td.group-cell { background: #f8fafc; color: #1e293b; font-weight: 700; text-align: center; vertical-align: middle; border-right: 2px solid #e5eaf3; }
  .contract-table td.group-cell .group-count { display: block; font-size: 11px; font-weight: 400; color: #666; margin-top: 2px; }

  /* 基本信息表 */
  .meta-table td { padding: 7px 12px; }
  .meta-table td.label { background: #f8fafc; color: #475569; font-weight: 600; width: 9%; text-align: center; white-space: nowrap; }
  .meta-table td.value { width: 41%; }

  /* 检测明细 */
  .main-table tbody tr:nth-child(even) td:not(.group-cell) { background: #fbfcfe; }
  .main-table tbody tr:hover td:not(.group-cell) { background: #f1f5ff; }
  .main-table td.group-cell { background: #f8fafc; }
  /* 板块列在组内不画横线，视觉上仍是整块 */
  .main-table tr.group-link td.group-cell { border-bottom-color: transparent; }
  .main-table td.group-cell-continued { border-top-color: transparent; }
  .main-table td.item-name { font-weight: 600; color: #1e293b; }
  .main-table .sev { display: inline-block; margin-top: 2px; font-size: 11px; border: 1px solid; border-radius: 2px; padding: 0 4px; }
  .sev-critical { color: #b91c1c; border-color: #b91c1c; background: #fef2f2; }
  .sev-warning { color: #b45309; border-color: #b45309; background: #fffbeb; }
  .sev-suggest { color: #6b7280; border-color: #6b7280; background: #fafafa; }
  .desc-cell .note { margin-top: 4px; padding: 3px 6px; background: #fffbeb; border-left: 3px solid #f59e0b; font-size: 12px; }
  .issue-table td.issue-type { font-weight: 600; color: #1e293b; }
  .issue-table td.issue-page { font-size: 12px; color: #64748b; word-break: break-all; }
  .issue-table td.issue-problem { color: #334155; word-break: break-word; }
  .issue-table td.issue-problem .issue-detail { margin-top: 3px; font-size: 11px; color: #64748b; word-break: break-all; }
  .issue-empty { border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 16px; background: #fff; font-size: 13px; color: #64748b; }

  .badge { display: inline-block; border: 1px solid; border-radius: 999px; padding: 2px 12px; font-size: 12px; font-weight: 600; white-space: nowrap; letter-spacing: .3px; }
  .badge-pass { color: #15803d; border-color: #15803d; background: #f0fdf4; }
  .badge-warn { color: #b45309; border-color: #b45309; background: #fffbeb; }
  .badge-fail { color: #b91c1c; border-color: #b91c1c; background: #fef2f2; }
  .badge-skip { color: #6b7280; border-color: #6b7280; background: #fafafa; }
  .badge-verify { color: #2563eb; border-color: #2563eb; background: #eff6ff; }
  .deliver-cell { text-align: center; vertical-align: middle; }
  .deliver-cell .badge { padding: 2px 8px; font-size: 11px; letter-spacing: 0; }
  /* 站点 Title / Favicon 具体值 */
  .site-meta { display: flex; flex-direction: column; gap: 6px; }
  .site-meta-line { display: flex; align-items: flex-start; gap: 4px; flex-wrap: wrap; }
  .site-meta .meta-label { flex: none; font-weight: 600; color: #475569; }
  .site-meta .meta-value { color: #1e293b; word-break: break-word; }
  .site-meta .meta-empty { color: #b91c1c; }
  .site-meta .meta-favicon-row { display: inline-flex; align-items: flex-start; gap: 6px; flex-wrap: wrap; }
  .site-meta .meta-favicon { display: inline-flex; flex: none; align-items: center; justify-content: center; width: 26px; height: 26px; border: 1px solid #e2e8f0; border-radius: 6px; background: #fff; overflow: hidden; }
  .site-meta .meta-favicon img { display: block; max-width: 20px; max-height: 20px; width: auto; height: auto; object-fit: contain; }
  .site-meta .meta-link { color: #475569; font-size: 11px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; word-break: break-all; }
  /* 内容说明：分行展示，长链接整体换行 */
  .main-table td.desc-cell { line-height: 1.7; }
  .main-table td.desc-cell br + * { margin-top: 2px; }
  .deliver-cell .deliver-text { display: inline-block; text-align: left; font-size: 12px; line-height: 1.6; color: #334155; word-break: break-word; }
  .deliver-cell .cell-deliver { text-align: left; }
  .stale-box { border-color: #fde68a; background: #fffbeb; }
  .stale-box .pageset-hint { color: #92400e; }
  .accept-table td.accept-cell { text-align: center; vertical-align: middle; }
  .accept-table td.item-name { font-weight: 600; color: #1e293b; }
  .status-cell .actual { margin-top: 3px; font-size: 12px; color: #444; max-width: 220px; word-break: break-all; }

  /* 证据截图 */
  .shot-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .shot-item { border: 1px solid #e2e8f0; border-radius: 10px; padding: 8px; background: #fff; box-shadow: 0 1px 8px rgba(15,23,42,.07); break-inside: avoid; }
  .shot-item img { width: 100%; display: block; border-radius: 6px; border: 1px solid #eef2f7; }
  .shot-item figcaption { font-size: 12px; color: #475569; padding: 6px 2px 0; text-align: center; font-weight: 600; }

  /* 检测页面集合 */
  .pageset-box { border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 16px; background: #fff; box-shadow: 0 1px 8px rgba(15,23,42,.06); margin-bottom: 4px; }
  .pageset-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 8px; }
  .pageset-hint { font-size: 12px; color: #64748b; }
  .pageset-sitemaps { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
  .pageset-sm { display: inline-block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; color: #475569; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 2px 8px; }
  .pageset-table-wrap { overflow-x: auto; }
  .pageset-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .pageset-table th { text-align: left; font-size: 11px; color: #64748b; font-weight: 600; border-bottom: 1px solid #e2e8f0; padding: 6px 8px; background: #fafbfe; }
  .pageset-table td { border-bottom: 1px solid #eef2f7; padding: 6px 8px; color: #334155; }
  .pageset-table tr:last-child td { border-bottom: none; }
  .pageset-url { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; word-break: break-all; }
  .pageset-sig { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: #64748b; word-break: break-all; }
  .matrix-box { margin-bottom: 4px; }
  .matrix-table th { text-align: left; }
  .matrix-table td.dx-url { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; word-break: break-all; color: #334155; }
  .matrix-table td.dx-num { text-align: center; color: #334155; }
  .matrix-table td.dx-badge { text-align: center; }
  .matrix-table td.dx-detail { font-size: 11px; color: #64748b; word-break: break-all; line-height: 1.5; }
  .matrix-table .dx-el { margin-bottom: 3px; }
  .matrix-table tr { break-inside: avoid; }

  .footer { margin-top: 32px; text-align: center; color: #94a3b8; font-size: 12px; border-top: 1px solid #e5eaf3; padding-top: 14px; }
</style>
<div class="report-root">

  <div class="header">
    ${logoDataUrl ? `<img src="${logoDataUrl}" alt="logo" style="display:block;height:44px;margin:0 auto 10px;object-fit:contain;" />` : ''}
    <h1>${escapeHtml(settings.reportTitle || '网站检测报告')}</h1>
    ${settings.companyName ? `<div class="company">${escapeHtml(settings.companyName)}</div>` : ''}
  </div>
  <h2 class="section-title">一、基本信息</h2>
  <table class="contract-table meta-table">
    <tr>
      <td class="label">站点名称</td><td class="value">${escapeHtml(site.name)}</td>
      <td class="label">检测网址</td><td class="value">${escapeHtml(displayUrl(site.url))}</td>
    </tr>
    <tr>
      <td class="label">报告编号</td><td class="value">WEB-REPORT-${String(task.id).padStart(4, '0')}</td>
      <td class="label">生成日期</td><td class="value">${escapeHtml(formatDateTime(generatedAt))}</td>
    </tr>
  </table>

  <h2 class="section-title">二、检测明细</h2>
  <table class="contract-table main-table">
    <thead>
      <tr>
        <th style="width:15%">检测板块</th>
        <th style="width:21%">检测项目</th>
        <th style="width:55%">内容说明</th>
        <th style="width:9%">交付成果</th>
      </tr>
    </thead>
    <tbody>${mainRows}</tbody>
  </table>

  ${issueSection ? `${sectionTitle('检测出的具体错误问题')}${issueSection}` : ''}

  ${screenshotSection ? `${sectionTitle('PageSpeed 评分截图')}${screenshotSection}` : ''}

  <div class="footer">${escapeHtml(settings.footerText)}</div>

</div>`
}
