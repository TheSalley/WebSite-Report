/** 页面显示工具：列表/报告的 URL 展示与紧凑路径 */

/** 将 URL 中的 UTF-8 百分号编码还原为可读文本；非法编码保持原样 */
function decodeForDisplay(value: string): string {
  try {
    return decodeURI(value)
  } catch {
    return value
  }
}

/** 完整 URL 展示：保留协议与主机，路径/查询串/锚点还原为可读文本 */
export function displayUrl(url: string): string {
  if (!url) return ''
  try {
    const x = new URL(url)
    const origin = x.origin && x.origin !== 'null' ? x.origin : `${x.protocol}//${x.host}`
    return origin + decodeForDisplay(x.pathname) + decodeForDisplay(x.search) + decodeForDisplay(x.hash)
  } catch {
    return decodeForDisplay(url)
  }
}

/** 页面显示标签：主页显示「主页」，否则 host + 路径（+查询串），可截断长度 */
export function pageLabel(url: string, opts?: { max?: number }): string {
  const max = opts?.max ?? 60
  if (!url) return '主页'
  try {
    const x = new URL(url)
    const path = x.pathname === '/' ? '' : decodeForDisplay(x.pathname)
    return (x.hostname + (x.port ? ':' + x.port : '') + path + decodeForDisplay(x.search)).slice(0, max)
  } catch {
    return decodeForDisplay(url).slice(0, max)
  }
}

/** 页面路径短标签：仅保留路径（主页显示为 /），用于规则描述中的紧凑列表 */
export function pagePathShort(url: string): string {
  try {
    const x = new URL(url)
    return x.pathname === '/' ? '/' : decodeForDisplay(x.pathname)
  } catch {
    return decodeForDisplay(url)
  }
}
