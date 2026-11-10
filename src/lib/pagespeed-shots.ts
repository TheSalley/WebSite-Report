import { join } from 'path'
import { mkdir } from 'fs/promises'
import { DATA_DIR } from './store'
import { getBrowser } from './engine/browser'
import { logInfo, logWarn } from './logger'

/** 取消检查：已取消则抛出，用于中断等待循环 */
function throwIfCancelled(signal?: { cancelled: boolean }): void {
  if (signal?.cancelled) {
    throw new Error('TASK_CANCELLED')
  }
}

function shotsDir(taskId: number): string {
  return join(DATA_DIR, 'screenshots', 'task-' + taskId)
}

/**
 * 采集 pagespeed.web.dev 测速得分报告截图（移动端/桌面端）。
 * - 支持取消信号（等待/导航间隙及时中断）
 * - 得分卡片超时后仍会截取当前可视区域作为兜底
 */
export async function capturePagespeedShots(
  taskId: number,
  url: string,
  signal?: { cancelled: boolean }
): Promise<void> {
  const dir = shotsDir(taskId)
  await mkdir(dir, { recursive: true })
  const browser = await getBrowser()
  // web.dev 会拒绝 HeadlessChrome UA（提示无法解析网址），改用真实 Chrome UA
  const chromeMajor = (await browser.version()).split('.')[0] || '131'
  const chromeUa = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeMajor}.0.0.0 Safari/537.36`
  const context = await browser.newContext({
    viewport: { width: 1366, height: 1400 },
    locale: 'zh-CN',
    deviceScaleFactor: 1,
    userAgent: chromeUa
  })
  try {
    const page = await context.newPage()

    /** 轮询等待得分卡片出现：ready=得分卡已出现 / error=页面报错(无法解析网址) / timeout=超时 */
    const waitScoreDom = async (timeoutMs: number): Promise<'ready' | 'error' | 'timeout'> => {
      const deadline = Date.now() + timeoutMs
      while (Date.now() < deadline) {
        throwIfCancelled(signal)
        const state = await page
          .evaluate(() => {
            const w = document.querySelector('.lh-scores-wrapper') as HTMLElement | null
            const hasScore =
              /性能\s*\d{1,3}/.test(document.body.innerText || '') &&
              /无障碍\s*\d{1,3}/.test(document.body.innerText || '')
            if (w && hasScore) return 'ready'
            // 真实错误会带目标 URL（如「无法解析 https://www.example.com/」）；「请输入有效的网址」只是输入框占位，不能当错误
            const pageText = document.body.innerText || ''
            if (/(无法解析|Unable to resolve|Enter a valid URL|URL 无效)/i.test(pageText) && /(https?:\/\/|www\.)/i.test(pageText)) return 'error'
            return 'waiting'
          })
          .catch(() => 'waiting')
        if (state === 'ready' || state === 'error') return state
        await page.waitForTimeout(3000)
      }
      return 'timeout'
    }

    /** 截取当前策略的报告图：优先得分卡片区域，找不到则整页可视区兜底 */
    const shotScore = async (strategy: 'mobile' | 'desktop'): Promise<void> => {
      throwIfCancelled(signal)
      logInfo(`等待 pagespeed.web.dev ${strategy} 得分卡片`, taskId)
      const state = await waitScoreDom(360000).catch(() => 'timeout' as const)
      throwIfCancelled(signal)
      if (state !== 'ready') {
        if (state === 'error') {
          logWarn(`pagespeed.web.dev ${strategy} 提示无法解析网址（目标站可能拦截 Google 抓取），不保存错误页`, taskId)
        } else {
          logWarn(`pagespeed.web.dev ${strategy} 得分等待超时，不保存当前页面`, taskId)
        }
        return
      }
      await page
        .evaluate(() => {
          const w = document.querySelector('.lh-scores-wrapper') as HTMLElement | null
          if (w) {
            const y = Math.max(0, w.getBoundingClientRect().top + window.scrollY - 90)
            window.scrollTo(0, y)
          }
        })
        .catch(() => undefined)
      await page.waitForTimeout(1500)
      const clip = await page
        .evaluate(() => {
          const wrapper = document.querySelector('.lh-scores-wrapper') as HTMLElement | null
          if (!wrapper) return null
          const rect = wrapper.getBoundingClientRect()
          const visibleW = wrapper.scrollWidth || rect.width
          const visibleH = wrapper.scrollHeight || rect.height
          if (visibleW < 200 || rect.height < 10) return null
          const left = Math.max(0, rect.left - 24)
          const top = Math.max(0, rect.top - 14)
          return {
            x: left,
            y: top,
            width: Math.min(window.innerWidth - left, visibleW + 48),
            height: Math.min(window.innerHeight - top, Math.max(visibleH, 140) + 560)
          }
        })
        .catch(() => null)
      const file = join(dir, 'pagespeed-' + strategy + '.png')
      if (clip && clip.width >= 300 && clip.height >= 200) {
        await page.screenshot({ path: file, clip })
      } else {
        await page.screenshot({ path: file })
      }
      logInfo(`pagespeed.web.dev ${strategy} 截图已保存: ${file}`, taskId)
    }

    const baseTarget = 'https://pagespeed.web.dev/analysis?url=' + encodeURIComponent(url)

    // 移动端：打开默认分析页（自动触发移动端测速）
    throwIfCancelled(signal)
    let webDevOpened = false
    try {
      await page.goto(baseTarget, { waitUntil: 'domcontentloaded', timeout: 30000 })
      webDevOpened = true
    } catch (e) {
      logWarn(`打开 pagespeed.web.dev 失败（${(e as Error).message.split('\n')[0]}），跳过截图`, taskId)
    }
    if (webDevOpened && !signal?.cancelled) {
      try {
        const cookieBtn = page.getByText('知道了', { exact: true })
        if (await cookieBtn.isVisible({ timeout: 3000 })) await cookieBtn.click()
      } catch {
        /* 无横幅则忽略 */
      }
      await shotScore('mobile')
    }

    // 桌面端：优先点击「桌面设备」按钮，按钮不可用时直接打开 desktop URL 兜底
    if (webDevOpened && !signal?.cancelled) {
      let desktopOpened = false
      try {
        const desktopBtn = page.getByText('桌面设备', { exact: true }).first()
        await desktopBtn.click({ timeout: 15000 })
        logInfo('pagespeed.web.dev 已切换桌面设备', taskId)
        desktopOpened = true
      } catch {
        logWarn('pagespeed.web.dev 桌面端切换按钮不可用，尝试直接打开桌面端分析页', taskId)
      }
      if (!desktopOpened && !signal?.cancelled) {
        throwIfCancelled(signal)
        try {
          await page
            .goto(baseTarget + '&strategy=desktop', { waitUntil: 'domcontentloaded', timeout: 30000 })
            .catch(() => undefined)
        } catch {
          /* 忽略 */
        }
      }
      await shotScore('desktop')
    }
  } finally {
    await context.close().catch(() => undefined)
  }

}
