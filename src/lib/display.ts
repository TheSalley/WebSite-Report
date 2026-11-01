/** 页面显示工具：列表/报告的 URL 展示与紧凑路径 */

/** 页面显示标签：主页显示「主页」，否则 host + 路径（+查询串），可截断长度 */
export function pageLabel(url: string, opts?: { max?: number }): string {
  const max = opts?.max ?? 60
  if (!url) return '主页'
  try {
    const x = new URL(url)
    const path = x.pathname === '/' ? '' : x.pathname
    return (x.hostname + (x.port ? ':' + x.port : '') + path + x.search).slice(0, max)
  } catch {
    return url.slice(0, max)
  }
}

/** 页面路径短标签：仅保留路径（主页显示为 /），用于规则描述中的紧凑列表 */
export function pagePathShort(url: string): string {
  try {
    const x = new URL(url)
    return x.pathname === '/' ? '/' : x.pathname
  } catch {
    return url
  }
}
