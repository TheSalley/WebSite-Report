import { accessSync, constants, readdirSync } from 'fs'
import { homedir, tmpdir } from 'os'
import { join } from 'path'

const SHELL_PREFIX = 'chromium_headless_shell-'
const FULL_PREFIX = 'chromium-'

/** 拼接某个浏览器目录下可执行文件路径（headless shell 或完整 chrome） */
function executableOf(root: string, prefix: string): string {
  try {
    const dir = readdirSync(root).find((e) => e.startsWith(prefix))
    if (!dir) return ''
    if (prefix === SHELL_PREFIX) {
      const sub = process.platform === 'win32' ? 'chrome-headless-shell-win64' : 'chrome-headless-shell-linux64'
      const exe = process.platform === 'win32' ? 'chrome-headless-shell.exe' : 'chrome-headless-shell'
      return join(root, dir, sub, exe)
    }
    const sub = process.platform === 'win32' ? 'chrome-win64' : 'chrome-linux64'
    const exe = process.platform === 'win32' ? 'chrome.exe' : 'chrome'
    return join(root, dir, sub, exe)
  } catch {
    return ''
  }
}

/** 目录是否真的可用：存在 Chromium 且当前用户可以执行 */
export function isPlaywrightDirUsable(dir: string): boolean {
  if (!dir) return false
  for (const prefix of [SHELL_PREFIX, FULL_PREFIX]) {
    const exe = executableOf(dir, prefix)
    if (!exe) continue
    try {
      accessSync(exe, constants.X_OK)
      return true
    } catch {
      /* 不存在或无执行权限 */
    }
  }
  return false
}

/**
 * 自动探测可用的 Playwright 浏览器目录并写入 process.env.PLAYWRIGHT_BROWSERS_PATH。
 *
 * 服务器部署常见场景：root 安装的浏览器在 /root/.cache/ms-playwright，
 * 服务以 www 等普通用户运行时读不到。install.sh 会把浏览器复制到公共目录
 * /opt/ms-playwright 并开放权限。本函数逐个探测，只接受“可执行文件真实存在
 * 且当前用户有执行权限”的目录，因此即使环境变量残留了 /root 等错误路径，
 * 也会自动切到可用目录，`npx next start` 无需手动 export。
 */
export function ensurePlaywrightBrowsersPath(): string | undefined {
  const explicit = process.env.PLAYWRIGHT_BROWSERS_PATH
  const candidates = [
    explicit,
    '/opt/ms-playwright',
    join(homedir(), '.cache', 'ms-playwright'),
    ...(process.platform === 'win32'
      ? [join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'ms-playwright')]
      : ['/root/.cache/ms-playwright']),
    join(tmpdir(), 'ms-playwright')
  ].filter((p): p is string => Boolean(p))

  const seen = new Set<string>()
  for (const dir of candidates) {
    if (!dir || seen.has(dir)) continue
    seen.add(dir)
    try {
      if (isPlaywrightDirUsable(dir)) {
        if (process.env.PLAYWRIGHT_BROWSERS_PATH !== dir) {
          process.env.PLAYWRIGHT_BROWSERS_PATH = dir
          console.log(`[playwright] 使用浏览器目录: ${dir}`)
        }
        return dir
      }
    } catch {
      /* 无权限访问，跳过继续探测 */
    }
  }
  console.warn('[playwright] 未找到可用的 Chromium 浏览器目录，请先执行 npx playwright install chromium')
  return explicit || undefined
}