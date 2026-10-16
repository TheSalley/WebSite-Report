import { existsSync } from 'fs'
import { homedir, tmpdir } from 'os'
import { join } from 'path'

/**
 * 自动探测 Playwright 浏览器目录并写入 process.env.PLAYWRIGHT_BROWSERS_PATH。
 *
 * 服务器部署常见场景：用 root 安装浏览器（默认在 /root/.cache/ms-playwright），
 * 但服务以 www 等普通用户运行，读不到 /root。本函数按优先级探测常见位置，
 * 使 `npx next start` 无需手动 export 环境变量即可启动浏览器。
 */
export function ensurePlaywrightBrowsersPath(): string | undefined {
  const explicit = process.env.PLAYWRIGHT_BROWSERS_PATH
  const candidates = [
    explicit,
    '/opt/ms-playwright',
    join(homedir(), '.cache', 'ms-playwright'),
    process.platform === 'win32'
      ? join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'ms-playwright')
      : '/root/.cache/ms-playwright',
    join(tmpdir(), 'ms-playwright')
  ].filter((p): p is string => Boolean(p))

  for (const dir of candidates) {
    try {
      if (dir && existsSync(dir)) {
        if (process.env.PLAYWRIGHT_BROWSERS_PATH !== dir) {
          process.env.PLAYWRIGHT_BROWSERS_PATH = dir
        }
        return dir
      }
    } catch {
      /* 无权限访问（如 /root 目录），跳过继续探测 */
    }
  }
  return explicit || undefined
}