import { readFile } from 'fs/promises'
import { join } from 'path'
import { DATA_DIR, getTask, getSite, getRuleSet, listCheckResults } from '../store'
import { getReportSettings } from '../settings'
import { getBrowser } from '../engine/browser'

import type { CheckResult, ReportSettings, Site, RuleSet, Task } from '../types'

/** 报告数据（含截图 dataURL） */
export interface ReportData {
  task: Task
  site: Site
  ruleSet: RuleSet
  results: (CheckResult & { screenshotDataUrl: string | null })[]
  generatedAt: string
  score: number
  passCount: number
  warnCount: number
  failCount: number
  skipCount: number
  verifyCount: number
  settings: ReportSettings
  /** PageSpeed 评分（任务可能没有，为 null） */
  pagespeed: import('../types').PageSpeedReportData | null
  /** PageSpeed 页面截图（移动端/桌面端 dataURL） */
  pagespeedShots: { strategy: string; dataUrl: string | null }[]
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

  const task: Task = {
    id: rawTask.id,
    siteId: rawTask.siteId,
    ruleSetId: rawTask.ruleSetId,
    status: rawTask.status,
    score: rawTask.score,
    passCount: rawTask.passCount,
    warnCount: rawTask.warnCount,
    failCount: rawTask.failCount,
    skipCount: rawTask.skipCount,
    startedAt: rawTask.startedAt,
    finishedAt: rawTask.finishedAt,
    site,
    ruleSet,
    pagespeed: rawTask.pagespeedJson ? JSON.parse(rawTask.pagespeedJson) : null
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
      severity: r.severity,
      status: r.status,
      actualValue: r.actualValue,
      expectedValue: r.expectedValue,
      description: r.description,
      screenshotPath: r.screenshotPath,
      note: r.note,
      checkedAt: r.checkedAt,
      screenshotDataUrl: await readScreenshotAsDataUrl(r.screenshotPath)
    }))
  )

  const passCount = results.filter((r) => r.status === 'pass').length
  const warnCount = results.filter((r) => r.status === 'warn').length
  const failCount = results.filter((r) => r.status === 'fail').length
  const skipCount = results.filter((r) => r.status === 'skip').length
  const verifyCount = results.filter((r) => r.status === 'verify').length

  return {
    task,
    site,
    ruleSet,
    results,
    generatedAt: new Date().toLocaleString('zh-CN'),
    score: task.score ?? 0,
    passCount,
    warnCount,
    failCount,
    skipCount,
    verifyCount,
    settings: await getReportSettings(),
    pagespeed: task.pagespeed ?? null,
    pagespeedShots: await readPagespeedShots(taskId)
  }
}

/** 状态徽章 HTML（合同风格：细边框 + 浅底色） */
function statusBadgeHtml(status: string): string {
  const map: Record<string, { text: string; cls: string }> = {
    pass: { text: '通过', cls: 'pass' },
    warn: { text: '通过', cls: 'pass' },
    fail: { text: '失败', cls: 'fail' },
    skip: { text: '跳过', cls: 'skip' },
    verify: { text: '待验收', cls: 'verify' }
  }
  const m = map[status] ?? { text: status, cls: 'skip' }
  return `<span class="badge badge-${m.cls}">${m.text}</span>`
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
  const { site, ruleSet, results, generatedAt, settings, pagespeedShots } = data
  const task = data.task
  const CN = ['一','二','三','四','五','六','七','八','九','十']
  let sectionNo = 3
  const sectionTitle = (title: string) => { const no = sectionNo++; return `<h2 class="section-title">${CN[no - 1] ?? no}、${title}</h2>` }
  const logoDataUrl = settings.logoPath ? await resolveLogoDataUrl(settings.logoPath) : null

  // 按分组聚合（保持检测顺序）
  const groups = new Map<string, (typeof data.results)[number][]>()
  for (const r of results) {
    const arr = groups.get(r.groupName) ?? []
    arr.push(r)
    groups.set(r.groupName, arr)
  }

  // ── 主检测明细表（合同式：板块列 rowspan 合并）──
  const mainRows = Array.from(groups.entries())
    .map(([groupName, groupResults]) =>
      groupResults
        .map((r, idx) => {
          const firstCell =
            idx === 0
              ? `<td rowspan="${groupResults.length}" class="group-cell">${escapeHtml(groupName)}<span class="group-count">${groupResults.length} 项</span></td>`
              : ''
          const noteHtml = r.note ? `<div class="note">复核备注：${escapeHtml(r.note)}</div>` : ''
          const descParts: string[] = []
          if (r.expectedValue) descParts.push(`<span class="desc-label">期望：</span>${escapeHtml(r.expectedValue)}`)
          if (r.description) descParts.push(escapeHtml(r.description))
          const descHtml = descParts.join('；')
          return `<tr>
            ${firstCell}
            <td class="item-cell"><div class="item-name">${escapeHtml(r.ruleName)}</div></td>
            <td class="desc-cell">${descHtml}${noteHtml}</td>
            <td class="deliver-cell">${statusBadgeHtml(r.status)}</td>
          </tr>`
        })
        .join('')
    )
    .join('')

  // ── PageSpeed 表（合同式）──
  const pagespeedSection = (() => {
    const ps = data.pagespeed
    if (!ps) return ''
    const rows: string[] = []
    for (const strategy of ['mobile', 'desktop'] as const) {
      const psItem = strategy === 'mobile' ? ps.mobile : ps.desktop
      if (!psItem) continue
      const title = strategy === 'mobile' ? '移动端' : '桌面端'
      if (!psItem.ok) {
        rows.push(`<tr><td class="group-cell">${title}</td><td colspan="2" class="ps-error">${escapeHtml(psItem.error ?? '获取失败')}</td></tr>`)
        continue
      }
      const cats = (psItem.categories ?? [])
        .map((cat) => { const sc = cat.score ?? 0; const color = sc >= 90 ? '#16a34a' : sc >= 50 ? '#d97706' : '#dc2626'; return `${escapeHtml(cat.title)} <b style="color:${color}">${cat.score == null ? '—' : sc}</b>` })
        .join('　')
      const metrics = (psItem.metrics ?? [])
        .map((m) => `${escapeHtml(m.title)} ${escapeHtml(m.displayValue)}`)
        .join('　')
      rows.push(`<tr>
        <td class="group-cell">${title}</td>
        <td class="item-cell">评分类别</td>
        <td class="desc-cell">${cats}</td>
      </tr>`)
      if (metrics) {
        rows.push(`<tr>
          <td class="group-cell"></td>
          <td class="item-cell">核心指标</td>
          <td class="desc-cell">${metrics}</td>
        </tr>`)
      }
    }
    if (rows.length === 0) return ''
    return `<table class="contract-table ps-table">
      <thead><tr><th style="width:12%">通道</th><th style="width:16%">项目</th><th>内容</th></tr></thead>
      <tbody>${rows.join('')}</tbody>
    </table>`
  })()

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
  .report-root { font-family: "Microsoft YaHei", "PingFang SC", "SimSun", sans-serif; color: #1f2430; background: #f6f8fb; padding: 32px 40px; line-height: 1.65; }
  @media print {
    .report-root { padding: 0; }
    @page { size: A4; }
    .report-root .contract-table { break-inside: auto; }
    .report-root .contract-table tr, .report-root .contract-table td { break-inside: auto; }
    .report-root .header, .report-root .stat, .report-root .shot-item { break-inside: avoid; }
    .report-root thead { display: table-header-group; }
    .report-root { background: #fff; }
    .stat-grid { grid-template-columns: repeat(6, 1fr); }
    .stat-total, .stat-pass, .stat-warn, .stat-fail, .stat-skip, .stat-verify { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .report-root .shot-grid { gap: 12pt; }
    .report-root .shot-item img { height: 200pt; object-fit: contain; background: #fff; }
    .report-root .shot-item figcaption { font-size: 10px; padding-top: 3pt; }
  }
  .report-root h1, .report-root h2, .report-root h3 { margin: 0; font-weight: 700; }

  /* 报告抬头（合同式居中标题，深蓝渐变底衬托 LOGO） */
  .header { text-align: center; background: linear-gradient(135deg, #1d4ed8 0%, #1e3a8a 55%, #14244a 100%); border-radius: 14px; padding: 26px 28px 24px; box-shadow: 0 8px 24px rgba(30,64,175,.18); margin-bottom: 26px; }
  .header h1 { font-size: 24px; letter-spacing: 3px; color: #ffffff; }
  .header .company { margin-top: 6px; font-size: 13px; color: #93c5fd; font-weight: 600; }
  .header .doc-no { margin-top: 8px; font-size: 12px; color: #cbd5e1; }

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

  /* 结果统计：彩色卡片 */
  .stat-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; margin-bottom: 6px; }
  .stat { border-radius: 12px; padding: 16px 10px; text-align: center; box-shadow: 0 2px 10px rgba(15,23,42,.06); }
  .stat .stat-num { font-size: 26px; font-weight: 800; line-height: 1.1; }
  .stat .stat-label { margin-top: 5px; font-size: 12px; color: inherit; opacity: .85; }
  .stat-pass { background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0; }
  .stat-warn { background: #fffbeb; color: #d97706; border: 1px solid #fde68a; }
  .stat-fail { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
  .stat-skip { background: #f8fafc; color: #64748b; border: 1px solid #e2e8f0; }
  .stat-verify { background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; }
  .stat-total { background: #1e293b; color: #fff; border: 1px solid #1e293b; }

  /* 检测明细 */
  .main-table tbody tr:nth-child(even) td { background: #fbfcfe; }
  .main-table tbody tr:hover td { background: #f1f5ff; }
  .main-table td.item-name { font-weight: 600; color: #1e293b; }
  .main-table .sev { display: inline-block; margin-top: 2px; font-size: 11px; border: 1px solid; border-radius: 2px; padding: 0 4px; }
  .sev-critical { color: #b91c1c; border-color: #b91c1c; background: #fef2f2; }
  .sev-warning { color: #b45309; border-color: #b45309; background: #fffbeb; }
  .sev-suggest { color: #6b7280; border-color: #6b7280; background: #fafafa; }
  .desc-cell .desc-label { color: #6b7280; }
  .desc-cell .note { margin-top: 4px; padding: 3px 6px; background: #fffbeb; border-left: 3px solid #f59e0b; font-size: 12px; }

  .badge { display: inline-block; border: 1px solid; border-radius: 999px; padding: 2px 12px; font-size: 12px; font-weight: 600; white-space: nowrap; letter-spacing: .3px; }
  .badge-pass { color: #15803d; border-color: #15803d; background: #f0fdf4; }
  .badge-warn { color: #b45309; border-color: #b45309; background: #fffbeb; }
  .badge-fail { color: #b91c1c; border-color: #b91c1c; background: #fef2f2; }
  .badge-skip { color: #6b7280; border-color: #6b7280; background: #fafafa; }
  .badge-verify { color: #2563eb; border-color: #2563eb; background: #eff6ff; }
  .deliver-cell { text-align: center; }
  .status-cell .actual { margin-top: 3px; font-size: 12px; color: #444; max-width: 220px; word-break: break-all; }

  /* PageSpeed */
  .ps-table .ps-error { color: #b91c1c; }

  /* 证据截图 */
  .shot-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .shot-item { border: 1px solid #e2e8f0; border-radius: 10px; padding: 8px; background: #fff; box-shadow: 0 1px 8px rgba(15,23,42,.07); break-inside: avoid; }
  .shot-item img { width: 100%; display: block; border-radius: 6px; border: 1px solid #eef2f7; }
  .shot-item figcaption { font-size: 12px; color: #475569; padding: 6px 2px 0; text-align: center; font-weight: 600; }

  .footer { margin-top: 32px; text-align: center; color: #94a3b8; font-size: 12px; border-top: 1px solid #e5eaf3; padding-top: 14px; }
</style>
<div class="report-root">

  <div class="header">
    ${logoDataUrl ? `<img src="${logoDataUrl}" alt="logo" style="height:44px;margin-bottom:10px;object-fit:contain;filter:drop-shadow(0 1px 2px rgba(0,0,0,.25));" />` : ''}
    <h1>${escapeHtml(settings.reportTitle || '网站合规性检测报告')}</h1>
    ${settings.companyName ? `<div class="company">${escapeHtml(settings.companyName)}</div>` : ''}
    <div class="doc-no">报告编号：WEB-REPORT-${String(task.id).padStart(4, '0')}　　生成日期：${escapeHtml(generatedAt)}</div>
  </div>

  <h2 class="section-title">一、基本信息</h2>
  <table class="contract-table meta-table">
    <tr>
      <td class="label">站点名称</td><td class="value">${escapeHtml(site.name)}</td>
      <td class="label">检测网址</td><td class="value">${escapeHtml(site.url)}</td>
    </tr>
    <tr>
      <td class="label">规则集</td><td class="value">${escapeHtml(ruleSet.name)}</td>
      <td class="label">任务编号</td><td class="value">#${task.id}</td>
    </tr>
    <tr>
      <td class="label">检测时间</td><td class="value">${escapeHtml(formatDateTime(task.startedAt))}</td>
      <td class="label">完成时间</td><td class="value">${escapeHtml(formatDateTime(task.finishedAt))}</td>
    </tr>
  </table>

  <h2 class="section-title">二、检测明细</h2>
  <table class="contract-table main-table">
    <thead>
      <tr>
        <th style="width:12%">检测板块</th>
        <th style="width:22%">检测项目</th>
        <th style="width:46%">内容说明</th>
        <th style="width:14%">交付成果</th>
      </tr>
    </thead>
    <tbody>${mainRows}</tbody>
  </table>

  ${pagespeedSection ? `${sectionTitle('PageSpeed 评分')}${pagespeedSection}` : ''}

  ${screenshotSection ? `${sectionTitle('PageSpeed 评分截图')}${screenshotSection}` : ''}

  <div class="footer">${escapeHtml(settings.footerText)}</div>

</div>`
}
