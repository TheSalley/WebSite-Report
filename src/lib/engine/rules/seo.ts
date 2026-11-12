import type { RuleHandler } from '../types'
import { collectSitemapGroups, countSitemapContent, getSitemapUrls, WP_SITEMAP_PATH } from '../page-set'
import { displayUrl } from '../../display'

export const seoRules: Record<string, RuleHandler> = {
  'seo.noindex.disabled': async ({ snapshot }) => {
    const hasNoindex = (value: string): boolean =>
      value
        .toLowerCase()
        .split(/[\s,;]+/)
        .some((token) => token === 'noindex' || token === 'none')
    const metaTags = ['robots', 'googlebot', 'bingbot']
    const blockedBy = [
      ...metaTags
        .filter((name) => hasNoindex(snapshot.metas[name] ?? ''))
        .map((name) => `meta ${name}`),
      ...(hasNoindex(snapshot.network.mainResponseHeaders['x-robots-tag'] ?? '') ? ['X-Robots-Tag'] : [])
    ]

    if (blockedBy.length > 0) {
      return {
        status: 'fail',
        actual: `${blockedBy.join('、')} 输出 noindex`,
        expected: '未输出 noindex（允许搜索引擎收录）',
        description: 'No-Index 未关闭，搜索引擎将不会收录该页面；请移除 robots meta / X-Robots-Tag 中的 noindex 设置'
      }
    }
    return {
      status: 'pass',
      actual: '未发现 noindex',
      expected: '未输出 noindex（允许搜索引擎收录）',
      description: 'No-Index 已关闭，页面可正常被搜索引擎收录'
    }
  },

  'seo.title.exists': async ({ snapshot }) => {
    const title = snapshot.title.trim()
    return {
      status: title ? 'pass' : 'fail',
      actual: title ? `"${title}"` : '无',
      expected: '存在非空 <title>',
      description: title ? '页面标题存在' : '缺少 <title> 或为空'
    }
  },

  'seo.title.length': async ({ snapshot, params }) => {
    const max = Number(params.maxLength ?? 60)
    const len = snapshot.title.trim().length
    return {
      status: len > 0 && len <= max ? 'pass' : len > 0 ? 'warn' : 'fail',
      actual: `${len} 字符`,
      expected: `≤ ${max} 字符`,
      description: len > 0 && len <= max ? '标题长度合理' : len > 0 ? `标题过长（${len} > ${max}）` : '标题未设置'
    }
  },

  'seo.meta.description': async ({ snapshot }) => {
    const desc = snapshot.metas['description'] ?? ''
    return {
      status: desc ? 'pass' : 'warn',
      actual: desc ? `${desc.slice(0, 50)}…` : '无',
      expected: '存在 meta description',
      description: desc ? '描述标签存在' : '缺少 meta description'
    }
  },

  'seo.og.basic': async ({ snapshot, params }) => {
    const require = (params.require as string[]) ?? ['og:title', 'og:image']
    const missing = require.filter((k) => !snapshot.ogTags[k])
    return {
      status: missing.length === 0 ? 'pass' : 'warn',
      actual: missing.length ? `缺少: ${missing.join(', ')}` : '完整',
      expected: `包含 ${require.join(', ')}`,
      description: missing.length ? `OG 标签缺失 ${missing.join(', ')}` : 'OG 基础标签齐全'
    }
  },

  'seo.canonical': async ({ snapshot }) => {
    const href = snapshot.links['canonical'] ?? ''
    return {
      status: href ? 'pass' : 'warn',
      actual: href ? href : '无',
      expected: '存在 <link rel="canonical">',
      description: href ? 'canonical 已设置' : '缺少 canonical 链接'
    }
  },

  'seo.robots.txt': async ({ snapshot, request }) => {
    try {
      const res = await request!.get(new URL('/robots.txt', snapshot.finalUrl).toString(), { timeout: 8000 })
      const raw = await res.text()
      const ok = res.ok() && /(user-agent|disallow|allow|sitemap)/i.test(raw)
      return {
        status: ok ? 'pass' : 'warn',
        actual: `HTTP ${res.status()}`,
        expected: 'robots.txt 可访问且有效',
        description: ok ? 'robots.txt 正常' : 'robots.txt 不存在或格式异常'
      }
    } catch {
      return {
        status: 'warn',
        actual: '请求失败',
        expected: 'robots.txt 可访问',
        description: '无法访问 robots.txt'
      }
    }
  },

  'seo.sitemap.xml': async ({ snapshot, request }) => {
    try {
      const origin = new URL(snapshot.finalUrl).origin
      // 优先复用 Playwright 请求上下文（带浏览器 UA/重定向），保持与页面访问一致
      const fetchSitemap = request
        ? async (url: string): Promise<string> => {
            const res = await request.get(url, { timeout: 8000 })
            if (!res.ok()) throw new Error(`HTTP ${res.status()}`)
            return res.text()
          }
        : undefined
      const sitemaps = getSitemapUrls(origin)
      const groups = await collectSitemapGroups(sitemaps, 0, fetchSitemap)
      const locTotal = groups.reduce((n, g) => n + g.locs.length, 0)
      if (locTotal === 0) {
        return {
          status: 'warn',
          actual: `${WP_SITEMAP_PATH} 无有效 URL`,
          expected: 'Sitemap 可访问且非空',
          description: `请求 ${WP_SITEMAP_PATH} 失败，或未提取到有效 URL`
        }
      }
      const counts = countSitemapContent(groups)
      const relevantTotal = counts.pages + counts.posts + counts.products
      if (relevantTotal === 0) {
        return {
          status: 'warn',
          actual: '未找到页面/新闻/产品',
          expected: 'Sitemap 包含页面/新闻/产品 URL',
          description: `请求 ${WP_SITEMAP_PATH} 成功，但未识别到页面/新闻/产品的 URL`
        }
      }
      return {
        status: 'pass',
        actual: `页面 ${counts.pages}、新闻 ${counts.posts}、产品 ${counts.products}`,
        expected: 'Sitemap 可访问且包含页面/新闻/产品内容',
        description: `已发现 Sitemap：${sitemaps.map(displayUrl).join('、')}；页面 ${counts.pages}、新闻 ${counts.posts}、产品 ${counts.products}`
      }
    } catch (e) {
      return {
        status: 'warn',
        actual: '请求失败',
        expected: 'Sitemap 可访问',
        description: `无法访问 ${WP_SITEMAP_PATH}：${(e as Error).message.slice(0, 80)}`
      }
    }
  },

  'seo.h1.exists': async ({ snapshot }) => {
    const count = snapshot.h1s.length
    return {
      status: count === 1 ? 'pass' : count >= 1 ? 'warn' : 'fail',
      actual: `${count} 个 h1`,
      expected: '恰好 1 个 h1',
      description: count === 1 ? '唯一 h1 已设置' : count > 1 ? `存在 ${count} 个 h1（建议唯一）` : '缺少 h1 标题'
    }
  }
}
