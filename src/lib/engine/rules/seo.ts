import type { RuleHandler } from '../types'
import { collectSitemapGroups, countSitemapContent, getSitemapUrls, WP_SITEMAP_PATH } from '../page-set'
import { displayUrl, pagePathShort } from '../../display'

/** 提取页面输出 noindex 的来源（meta robots / googlebot / bingbot、X-Robots-Tag） */
function noindexSources(snapshot: {
  metas?: Record<string, string>
  network?: { mainResponseHeaders?: Record<string, string> }
}): string[] {
  const metas = snapshot.metas ?? {}
  const headers = snapshot.network?.mainResponseHeaders ?? {}
  const hasNoindex = (value: string): boolean =>
    value
      .toLowerCase()
      .split(/[\s,;]+/)
      .some((token) => token === 'noindex' || token === 'none')
  const metaTags = ['robots', 'googlebot', 'bingbot']
  return [
    ...metaTags.filter((name) => hasNoindex(metas[name] ?? '')).map((name) => `meta ${name}`),
    ...(hasNoindex(headers['x-robots-tag'] ?? '') ? ['X-Robots-Tag'] : [])
  ]
}

/** 提取首页 favicon 链接（兼容 shortcut icon / apple-touch-icon） */
function faviconHref(links: Record<string, string>): string {
  for (const [rel, href] of Object.entries(links)) {
    if (!href) continue
    const rels = rel.toLowerCase().split(/\s+/)
    if (rels.includes('icon') || rels.includes('apple-touch-icon')) return href
  }
  return ''
}

/** 将 favicon 相对链接解析为绝对 URL（报告内嵌图片使用） */
function absoluteIconUrl(href: string, baseUrl: string): string {
  try {
    return new URL(href, baseUrl).toString()
  } catch {
    return href
  }
}

/** 将 favicon 相对链接解析为展示用 URL */
function faviconLabel(href: string, baseUrl: string): string {
  try {
    return displayUrl(new URL(href, baseUrl).toString())
  } catch {
    return displayUrl(href)
  }
}

export const seoRules: Record<string, RuleHandler> = {
  'seo.noindex.disabled': async ({ snapshot, pageSnapshots }) => {
    const pages = pageSnapshots?.length
      ? pageSnapshots
      : snapshot.metas && snapshot.network
        ? [{ url: snapshot.finalUrl, snapshot }]
        : []
    if (pages.length === 0) {
      return {
        status: 'fail',
        actual: '无页面数据',
        expected: '至少 1 个页面可检测',
        description: '未采集到页面快照，无法检查 No-Index'
      }
    }
    const blocked = pages
      .map((page) => ({ url: pagePathShort(page.url), blockedBy: noindexSources(page.snapshot) }))
      .filter((page) => page.blockedBy.length > 0)
    if (blocked.length > 0) {
      const detail = blocked
        .slice(0, 8)
        .map((page) => `${page.url}（${page.blockedBy.join('、')}）`)
        .join('；')
      return {
        status: 'fail',
        actual: `${blocked.length}/${pages.length} 页输出 noindex`,
        expected: '未输出 noindex（允许搜索引擎收录）',
        description: `No-Index 未关闭，搜索引擎将不会收录这些页面：${detail}${blocked.length > 8 ? ` 等 ${blocked.length} 个页面` : ''}；请移除 robots meta / X-Robots-Tag 中的 noindex 设置`
      }
    }
    return {
      status: 'pass',
      actual: `${pages.length} 页未发现 noindex`,
      expected: '未输出 noindex（允许搜索引擎收录）',
      description: `全部 ${pages.length} 个页面均未输出 noindex，页面可正常被搜索引擎收录`
    }
  },

  /** 站点级：检查首页浏览器标签页所需的 Title 与 Favicon */
  'seo.site.title-favicon': async ({ pageSnapshots }) => {
    const home = pageSnapshots?.[0]?.snapshot
    if (!home) {
      return {
        status: 'fail',
        actual: '首页未加载',
        expected: '首页站点 Title 与 Favicon 可检测',
        description: '首页页面加载失败，无法检查站点 Title 与 Favicon'
      }
    }

    const title = home.title.replace(/\s+/g, ' ').trim()
    const icon = faviconHref(home.links)
    const titleText = title ? `Title：“${title.slice(0, 80)}${title.length > 80 ? '…' : ''}”` : 'Title 未设置'
    const iconUrl = icon ? faviconLabel(icon, home.finalUrl) : ''
    const iconText = iconUrl ? `Favicon：${iconUrl.slice(0, 120)}${iconUrl.length > 120 ? '…' : ''}` : 'Favicon 未设置'
    const actual = `${titleText}；${iconText}`
    // 报告展示用：完整 Title 与 Favicon 绝对地址（actual 里为紧凑截断文本）
    const data = { title, faviconUrl: icon ? absoluteIconUrl(icon, home.finalUrl) : '' }

    if (title && icon) {
      return {
        status: 'pass',
        actual,
        expected: '首页设置非空站点 Title 和 Favicon',
        description: '首页站点 Title 与 Favicon 均已配置',
        data
      }
    }

    const description =
      !title && !icon
        ? '首页未设置站点 Title，且未发现 Favicon'
        : !title
          ? '首页未设置站点 Title，已配置 Favicon；请补充 <title>'
          : '首页已设置站点 Title，但未发现 Favicon；请在 <head> 中添加 <link rel="icon" href="...">'

    return {
      status: 'fail',
      actual,
      expected: '首页设置非空站点 Title 和 Favicon',
      description,
      data
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
