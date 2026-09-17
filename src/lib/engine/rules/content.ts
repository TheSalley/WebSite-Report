import type { RuleHandler } from '../types'

export const contentRules: Record<string, RuleHandler> = {
  'content.charset': async ({ snapshot }) => {
    const charset = snapshot.charset || snapshot.metas['content-type']?.match(/charset=([\w-]+)/i)?.[1]?.toLowerCase() || ''
    const ok = charset.includes('utf-8') || charset.includes('utf8')
    return {
      status: ok ? 'pass' : 'fail',
      actual: charset || '未声明',
      expected: 'UTF-8',
      description: ok ? '编码正确' : '编码非 UTF-8 或未声明'
    }
  },

  'content.favicon': async ({ snapshot }) => {
    const has = Object.keys(snapshot.links).some((rel) => rel.includes('icon'))
    return {
      status: has ? 'pass' : 'warn',
      actual: has ? '存在' : '无',
      expected: '存在 favicon',
      description: has ? '站点图标已设置' : '缺少 favicon'
    }
  },

  'content.viewport': async ({ snapshot }) => {
    const vp = snapshot.metas['viewport'] ?? ''
    const ok = snapshot.hasViewport && /width\s*=\s*device-width/i.test(vp)
    return {
      status: ok ? 'pass' : 'fail',
      actual: vp || '无',
      expected: 'width=device-width',
      description: ok ? '移动端 viewport 正确' : '缺少 viewport 或未设置 device-width'
    }
  },

  'content.console.errors': async ({ snapshot }) => {
    const errors = snapshot.network.consoleErrors
    return {
      status: errors.length === 0 ? 'pass' : 'warn',
      actual: errors.length ? `${errors.length} 条错误` : '无',
      expected: '无未捕获 JS 错误',
      description: errors.length ? errors.slice(0, 3).join(' | ') : '控制台无错误'
    }
  },

  'content.404.friendly': async ({ snapshot, request }) => {
    try {
      const url = new URL(snapshot.finalUrl)
      const testUrl = `${url.origin}/__webreport_404_test_${Date.now()}`
      const res = await request!.get(testUrl, { timeout: 8000, failOnStatusCode: false })
      return {
        status: res.status() === 404 ? 'pass' : 'warn',
        actual: `HTTP ${res.status()}`,
        expected: '随机路径返回 404',
        description: res.status() === 404 ? '404 页面正常' : '随机路径未返回 404（可能返回 200 或其他状态）'
      }
    } catch {
      return {
        status: 'warn',
        actual: '请求失败',
        expected: '随机路径返回 404',
        description: '无法验证 404 行为'
      }
    }
  }
}
