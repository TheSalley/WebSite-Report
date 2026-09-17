import type { Page, Response, Request } from 'playwright'
import type { PageSnapshot } from './types'

/** 网络快照类型：复用 PageSnapshot.network 结构 */
export type NetworkSnapshot = PageSnapshot['network']

declare module 'playwright' {
  interface Page {
    __snapshotNetwork?: NetworkSnapshot
  }
}

/**
 * 在导航前调用：监听网络/控制台事件，填充 page.__snapshotNetwork。
 * 必须在 page.goto 之前挂载。
 */
export function attachNetworkCollector(page: Page): void {
  const network: NetworkSnapshot = {
    totalBytes: 0,
    requestCount: 0,
    responseHeaders: {},
    mainResponseHeaders: {},
    mainStatus: 0,
    consoleErrors: [],
    mixedContents: [],
    requests: []
  }
  page.__snapshotNetwork = network

  page.on('response', (res: Response) => {
    try {
      const url = res.url()
      const req = res.request()
      const resourceType = req.resourceType()
      const headers = res.headers()
      // 只统计主文档与常规资源，忽略 data: 等
      if (url.startsWith('data:') || url.startsWith('blob:')) return

      network.requestCount++
      const size = Number(headers['content-length']) || 0
      network.totalBytes += size
      network.requests.push({ url, resourceType, status: res.status(), size })

      if (resourceType === 'document' && !network.mainStatus) {
        network.mainStatus = res.status()
        network.mainResponseHeaders = headers
      } else {
        // 安全头只需记录主文档与样式/脚本
        if (['document', 'stylesheet', 'script'].includes(resourceType)) {
          network.responseHeaders[url] = headers
        }
      }

      // 混合内容：https 页面上加载 http 资源（浏览器会自动升级，但标记）
      try {
        const reqUrl = new URL(url)
        if (page.url().startsWith('https://') && reqUrl.protocol === 'http:') {
          network.mixedContents.push(url)
        }
      } catch {
        // URL 解析失败忽略
      }
    } catch {
      // 忽略个体响应解析失败
    }
  })

  page.on('requestfailed', (req: Request) => {
    const error = req.failure()?.errorText
    if (error) {
      network.consoleErrors.push(`请求失败: ${req.url()} (${error})`)
    }
  })

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      network.consoleErrors.push(msg.text())
    }
  })

  page.on('pageerror', (err) => {
    network.consoleErrors.push(err.message)
  })
}
