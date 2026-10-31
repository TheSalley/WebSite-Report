import { ensurePlaywrightBrowsersPath } from './playwright-path'
import type { Browser, Page } from 'playwright'

// 必须在 playwright 模块加载前确定浏览器目录（playwright 在模块加载时读取
// PLAYWRIGHT_BROWSERS_PATH 并固定 registryDirectory），因此这里用动态导入。
ensurePlaywrightBrowsersPath()

let chromium: typeof import('playwright')['chromium'] | null = null

async function getChromium(): Promise<typeof import('playwright')['chromium']> {
  if (!chromium) chromium = (await import('playwright')).chromium
  return chromium
}

let browser: Browser | null = null

/**
 * 获取全局浏览器实例（懒加载，单例复用）。
 * 开发环境自动使用 Playwright 已安装的 Chromium。
 */
export async function getBrowser(): Promise<Browser> {
  if (browser && browser.isConnected()) return browser
  const c = await getChromium()
  browser = await c.launch({
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