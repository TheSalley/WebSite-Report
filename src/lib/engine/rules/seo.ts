import type { RuleHandler } from '../types'

export const seoRules: Record<string, RuleHandler> = {
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
      const res = await request!.get(new URL('/sitemap.xml', snapshot.finalUrl).toString(), { timeout: 8000 })
      const raw = await res.text()
      const ok = res.ok() && /<urlset|<url>/i.test(raw)
      return {
        status: ok ? 'pass' : 'warn',
        actual: `HTTP ${res.status()}`,
        expected: 'sitemap.xml 可访问',
        description: ok ? '站点地图正常' : 'sitemap.xml 不存在或为空'
      }
    } catch {
      return {
        status: 'warn',
        actual: '请求失败',
        expected: 'sitemap.xml 可访问',
        description: '无法访问 sitemap.xml'
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
