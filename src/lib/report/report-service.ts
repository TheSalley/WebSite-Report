import { readFile } from 'fs/promises'
import { join } from 'path'
import { DATA_DIR, getTask, getSite, getRuleSet, listCheckResults, listRulesForSet } from '../store'
import { getReportSettings } from '../settings'
import { DELIVERABLE_PRESETS } from '../seed'
import { getBrowser } from '../engine/browser'
import { describeElementorItem } from '../engine/rules/delivery'
import { displayUrl, pageLabel } from '../display'

import type { CheckResult, ReportSettings, Site, RuleSet, Task, SiteDataByRuleKey } from '../types'
import { resultKind } from '../rule-kinds'

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
  return out
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
  const skipCount = checkResults.filter((r) => r.status === 'skip').length
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
<title>${escapeHtml(data.settings.reportTitle || '网站合规性检测报告')}</title>
</head>
<body>${await buildReportHtml(data)}</body>
</html>`
  const browser = await getBrowser()
  const page = await browser.newPage()
  try {
    await page.setContent(html, { waitUntil: 'networkidle' })
    await page.emulateMedia({ media: 'print' })
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<div style="font-size:9px;color:#888;width:100%;text-align:center;padding:0 10mm 2mm 10mm;">' + data.settings.reportTitle + '</div>',
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

  // 检测明细包含机器检测与合同文案；功能产物不进入明细表
  const reportResults = results.filter((r) => resultKind(r) !== 'artifact')

  // 按分组聚合（保持检测顺序）
  const groups = new Map<string, (typeof data.results)[number][]>()
  for (const r of reportResults) {
    const arr = groups.get(r.groupName) ?? []
    arr.push(r)
    groups.set(r.groupName, arr)
  }

  // ── 主检测明细表（合同式：板块列 rowspan 合并）──
  const orderedGroups = Array.from(groups.entries()).sort(
    ([a], [b]) => (data.groupOrder[a] ?? Number.MAX_SAFE_INTEGER) - (data.groupOrder[b] ?? Number.MAX_SAFE_INTEGER)
  )
  const mainRows = orderedGroups
    .map(([groupName, groupResults]) =>
      groupResults
        .map((r, idx) => {
          const firstCell =
            idx === 0
              ? `<td rowspan="${groupResults.length}" class="group-cell">${escapeHtml(groupName)}<span class="group-count">${groupResults.length} 项</span></td>`
              : ''
          const noteHtml = r.note ? `<div class="note">备注：${safeReportText(r.note)}</div>` : ''
          const descParts: string[] = []
          if (r.description) descParts.push(safeReportText(r.description))
          const descHtml = descParts.join('；')
          return `<tr>
            ${firstCell}
            <td class="item-cell"><div class="item-name">${escapeHtml(r.ruleName)}</div></td>
            <td class="page-cell">${escapeHtml(pageLabel(r.pageUrl))}</td>
            <td class="desc-cell">${descHtml}${noteHtml}</td>
            <td class="deliver-cell">
              ${r.deliverable && r.deliverable.trim() ? `<div class="cell-deliver"><span class="deliver-text">${safeReportText(r.deliverable)}</span></div>` : ''}
            </td>
          </tr>`
        })
        .join('')
    )
    .join('')

  // ── 检测出的具体错误问题（网站交付检查）──
  const isDeliveryReport = reportResults.some((r) => r.ruleKey.startsWith('delivery.'))
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
      if (!r.ruleKey.startsWith('delivery.')) continue
      if (r.ruleKey === 'delivery.h1.count' || r.ruleKey === 'delivery.elementor.hidden-both') continue
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
  .report-root { font-family: "Microsoft YaHei", "PingFang SC", "SimSun", "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif; color: #1f2430; background: #f6f8fb; padding: 32px 40px; line-height: 1.65; }
  @media print {
    .report-root { padding: 0; }
    @page { size: A4; }
    .report-root .contract-table { break-inside: auto; }
    .report-root .contract-table tr, .report-root .contract-table td { break-inside: auto; }
    .report-root .header, .report-root .shot-item { break-inside: avoid; }
    .report-root thead { display: table-header-group; }
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
  .main-table tbody tr:nth-child(even) td { background: #fbfcfe; }
  .main-table tbody tr:hover td { background: #f1f5ff; }
  .main-table td.item-name { font-weight: 600; color: #1e293b; }
  .main-table td.page-cell { font-size: 12px; color: #64748b; word-break: break-all; max-width: 150px; vertical-align: middle; }
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
    <h1>${escapeHtml(settings.reportTitle || '网站合规性检测报告')}</h1>
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
        <th style="width:11%">检测板块</th>
        <th style="width:18%">检测项目</th>
        <th style="width:13%">检测页面</th>
        <th style="width:44%">内容说明</th>
        <th style="width:14%">交付成果</th>
      </tr>
    </thead>
    <tbody>${mainRows}</tbody>
  </table>

  ${issueSection ? `${sectionTitle('检测出的具体错误问题')}${issueSection}` : ''}

  ${screenshotSection ? `${sectionTitle('PageSpeed 评分截图')}${screenshotSection}` : ''}

  <div class="footer">${escapeHtml(settings.footerText)}</div>

</div>`
}
