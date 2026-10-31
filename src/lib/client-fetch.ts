/** 带超时的 fetch + JSON。网络异常/超时都会抛错，绝不无限等待。 */
export async function fetchJson<T = unknown>(url: string, init?: RequestInit, timeoutMs = 10000): Promise<T> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal })
    if (!res.ok) throw new Error('请求失败（' + res.status + '），请检查服务状态')
    return (await res.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

/** 给 AbortError 显示友好信息 */
export function friendlyError(e: unknown): string {
  if (e instanceof DOMException && e.name === 'AbortError') return '请求超时，请检查网络或服务是否正常'
  return (e as Error).message || '网络异常'
}
