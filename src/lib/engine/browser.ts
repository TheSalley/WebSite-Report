import { chromium, type Browser, type Page } from 'playwright'

let browser: Browser | null = null

/**
 * 获取全局浏览器实例（懒加载，单例复用）。
 * 开发环境自动使用 Playwright 已安装的 Chromium。
 */
export async function getBrowser(): Promise<Browser> {
  if (browser && browser.isConnected()) return browser
  browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-default-apps',
      '--mute-audio',
      '--no-default-browser-check'
    ]
  })
  return browser
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close().catch(() => undefined)
    browser = null
  }
}

/** 新建一个独立上下文（隔离缓存/存储） */
export async function newPage(): Promise<Page> {
  const b = await getBrowser()
  const context = await b.newContext({ locale: 'zh-CN' })
  return context.newPage()
}
