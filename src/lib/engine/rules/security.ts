import type { RuleHandler } from '../types'

export const securityRules: Record<string, RuleHandler> = {
  'security.https': async ({ snapshot }) => {
    const ok = snapshot.finalUrl.startsWith('https://')
    return {
      status: ok ? 'pass' : 'fail',
      actual: snapshot.finalUrl.startsWith('http://') ? 'http://' : snapshot.finalUrl,
      expected: 'https://',
      description: ok ? 'HTTPS 已启用' : snapshot.finalUrl.startsWith('http://') ? '页面为 http 访问，未启用 HTTPS' : '无法确认 HTTPS'
    }
  },

  'security.cert.days': async ({ snapshot, request }) => {
    try {
      const res = await request!.get(snapshot.finalUrl, { timeout: 10000, failOnStatusCode: false })
      const viaHttps = snapshot.finalUrl.startsWith('https://') && res.ok()
      return {
        status: viaHttps ? 'pass' : 'fail',
        actual: viaHttps ? 'HTTPS 可达' : '无法建立 HTTPS 连接',
        expected: 'HTTPS 证书有效',
        description: viaHttps ? 'HTTPS 连接成功（证书有效）' : '无法建立 HTTPS 连接'
      }
    } catch (e) {
      return {
        status: 'fail',
        actual: (e as Error).message.slice(0, 80),
        expected: 'HTTPS 证书有效',
        description: 'HTTPS 握手失败'
      }
    }
  },

  'security.hsts': async ({ snapshot }) => {
    const hsts = snapshot.network.mainResponseHeaders['strict-transport-security']
    return {
      status: hsts ? 'pass' : 'warn',
      actual: hsts ? '已设置' : '未设置',
      expected: '存在 Strict-Transport-Security 头',
      description: hsts ? `HSTS: ${hsts.slice(0, 40)}` : '缺少 HSTS 响应头'
    }
  },

  'security.security.headers': async ({ snapshot, params }) => {
    const require = (params.require as string[]) ?? ['X-Frame-Options', 'X-Content-Type-Options', 'Referrer-Policy']
    const headers = snapshot.network.mainResponseHeaders
    const missing = require.filter((h) => !headers[h.toLowerCase()])
    return {
      status: missing.length === 0 ? 'pass' : 'warn',
      actual: missing.length ? `缺少: ${missing.join(', ')}` : '齐全',
      expected: `包含 ${require.join(', ')}`,
      description: missing.length ? `以下安全头缺失: ${missing.join(', ')}` : '基础安全头齐全'
    }
  },

  'security.sensitive.info': async ({ snapshot }) => {
    const patterns = [
      /(password|passwd)\s*[:=]\s*['"][^'"]{3,}['"]/i,
      /(api[_-]?key|secret|token)\s*[:=]\s*['"][^'"]{8,}['"]/i,
      /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/i
    ]
    const matches: string[] = []
    const text = snapshot.bodyText + '\n' + JSON.stringify(snapshot.metas)
    for (const p of patterns) {
      const m = text.match(p)
      if (m) matches.push(m[0].slice(0, 60))
    }
    return {
      status: matches.length === 0 ? 'pass' : 'fail',
      actual: matches.length ? `发现 ${matches.length} 处疑似` : '未发现',
      expected: '无敏感信息（密码/密钥/Token）',
      description: matches.length ? `疑似敏感信息: ${matches.join('; ')}` : '页面无敏感信息泄露'
    }
  },

  'security.mixed.content': async ({ snapshot }) => {
    const mixed = snapshot.network.mixedContents
    return {
      status: mixed.length === 0 ? 'pass' : 'fail',
      actual: mixed.length ? `${mixed.length} 个 http 资源` : '无',
      expected: '无 http 子资源',
      description: mixed.length ? `混合内容: ${mixed.slice(0, 5).join(', ')}` : '无混合内容'
    }
  }
}
