import type { RuleHandler } from '../types'
import { discoverSitemapUrls, collectSitemapLocsGrouped } from '../page-set'
import { displayUrl, pagePathShort } from '../../display'
import type { ElementorHiddenItem } from '../../types'

/** 单条 Elementor 隐藏板块的展示文本（规则描述与报告明细表共用） */
export function describeElementorItem(e: ElementorHiddenItem): string {
  const parts = [e.tag]
  if (e.id) parts.push(`#${e.id}`)
  if (e.classes) parts.push(`[${e.classes}]`)
  if (e.text) parts.push(`“${e.text}”`)
  return parts.join(' ')
}

export const deliveryRules: Record<string, RuleHandler> = {
  /** 交付检查（站点级聚合）：全站 H1 标签——每页应恰好 1 个，列出缺失/重复的页面 */
  'delivery.h1.count': async ({ pageSnapshots }) => {
    const pages = pageSnapshots ?? []
    if (pages.length === 0) {
      return {
        status: 'fail',
        actual: '无页面数据',
        expected: '至少 1 个代表页可检测',
        description: '未采集到任何代表页面快照，无法汇总 H1'
      }
    }
    const missing = pages.filter((p) => p.snapshot.h1s.length === 0).map((p) => pagePathShort(p.url))
    const multiple = pages
      .filter((p) => p.snapshot.h1s.length > 1)
      .map((p) => `${pagePathShort(p.url)}（${p.snapshot.h1s.length} 个）`)
    const status = missing.length > 0 ? 'fail' : multiple.length > 0 ? 'warn' : 'pass'
    const list = (arr: string[]) => (arr.length === 0 ? '无' : arr.slice(0, 8).join('、') + (arr.length > 8 ? ` 等 ${arr.length} 个` : ''))
    const detail = missing.length > 0 ? `缺 h1：${list(missing)}` : multiple.length > 0 ? `h1 重复：${list(multiple)}` : `全部 ${pages.length} 页 h1 均唯一`
    return {
      status,
      actual: `${pages.length} 页中 ${missing.length} 页缺 h1、${multiple.length} 页 h1 重复`,
      expected: '每个页面恰好 1 个 h1',
      description: detail,
      // 逐页明细（供报告按页面表格渲染）
      data: { pages: pages.map((p) => ({ url: p.url, h1s: p.snapshot.h1s.slice(0, 8) })) }
    }
  },

  /** 交付检查（站点级聚合）：全站 Elementor 同时隐藏于桌面与移动端的板块（列出页面） */
  'delivery.elementor.hidden-both': async ({ pageSnapshots }) => {
    const pages = pageSnapshots ?? []
    const describe = describeElementorItem
    const found = pages
      .map((p) => ({ url: pagePathShort(p.url), items: p.snapshot.elementorHiddenBoth }))
      .filter((x) => x.items.length > 0)
    const n = found.reduce((sum, x) => sum + x.items.length, 0)
    const detail = found
      .map((x) => {
        const samples = x.items.slice(0, 2).map(describe).join('；')
        return `${x.url}（${samples}${x.items.length > 2 ? ` 等 ${x.items.length} 个` : ''}）`
      })
      .slice(0, 8)
      .join('；')
    return {
      status: n === 0 ? 'pass' : 'fail',
      actual: n === 0 ? '未发现' : `${found.length} 页共 ${n} 个元素`,
      expected: '不存在同时含 elementor-hidden-desktop 与 elementor-hidden-mobile 的元素',
      description:
        n === 0
          ? '所有代表页均未发现同时隐藏于桌面与移动端的 Elementor 板块'
          : `发现未删除的隐藏板块：${detail}${found.length > 8 ? ' 等' : ''}`,
      // 逐页明细（供报告按页面表格渲染）
      data: { pages: pages.map((p) => ({ url: p.url, items: p.snapshot.elementorHiddenBoth.slice(0, 5) })) }
    }
  },

  /** 交付检查：Sitemap（站点级，仅执行一次）——robots.txt 声明、sitemap 可访问且含有效 URL */
  'delivery.sitemap': async ({ snapshot, pageSet }) => {
    // 优先复用页面枚举阶段已采集的数据（整站检查不重复抓取，避免被源站限流）
    if (pageSet && pageSet.sitemaps) {
      if (pageSet.sitemaps.length === 0) {
        return {
          status: 'fail',
          actual: '未发现 sitemap',
          expected: 'robots.txt 声明 Sitemap 且可访问',
          description: 'robots.txt 未声明 Sitemap，常见路径（/sitemap.xml、/sitemap_index.xml）也未找到有效内容'
        }
      }
      if (pageSet.locTotal === 0) {
        return {
          status: 'fail',
          actual: `${pageSet.sitemaps.length} 个 sitemap，0 个 URL`,
          expected: 'sitemap 至少包含 1 个有效 URL',
          description: `已发现 ${pageSet.sitemaps.length} 个 sitemap 但均未提取到有效 URL：${pageSet.sitemaps.map(displayUrl).join('、')}`
        }
      }
      return {
        status: 'pass',
        actual: `${pageSet.sitemaps.length} 个 sitemap，共 ${pageSet.locTotal} 个 URL`,
        expected: 'robots.txt 声明 Sitemap，可访问且非空',
        description: `robots.txt 已声明 Sitemap：${pageSet.sitemaps.map(displayUrl).join('、')}，共 ${pageSet.locTotal} 个 URL`
      }
    }
    // 回退：无枚举数据（如单页任务）时独立抓取校验
    try {
      const origin = new URL(snapshot.finalUrl).origin
      const sitemaps = await discoverSitemapUrls(origin)
      if (sitemaps.length === 0) {
        return {
          status: 'fail',
          actual: '未发现 sitemap',
          expected: 'robots.txt 声明 Sitemap 且可访问',
          description: 'robots.txt 未声明 Sitemap，常见路径（/sitemap.xml、/sitemap_index.xml）也未找到有效内容'
        }
      }
      const groups = await collectSitemapLocsGrouped(sitemaps)
      const locTotal = groups.reduce((n, g) => n + g.length, 0)
      if (locTotal === 0) {
        return {
          status: 'fail',
          actual: `${sitemaps.length} 个 sitemap，0 个 URL`,
          expected: 'sitemap 至少包含 1 个有效 URL',
          description: `已发现 ${sitemaps.length} 个 sitemap 但均未提取到 URL：${sitemaps.map(displayUrl).join('、')}`
        }
      }
      return {
        status: 'pass',
        actual: `${sitemaps.length} 个 sitemap，共 ${locTotal} 个 URL`,
        expected: 'robots.txt 声明 Sitemap，可访问且非空',
        description: `robots.txt 已声明 Sitemap：${sitemaps.map(displayUrl).join('、')}，共 ${locTotal} 个 URL`
      }
    } catch (e) {
      return {
        status: 'fail',
        actual: '检查失败',
        expected: 'sitemap 可访问',
        description: `sitemap 检查异常：${(e as Error).message.slice(0, 80)}`
      }
    }
  }
}
