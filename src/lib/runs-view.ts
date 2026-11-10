import type { CheckResult, CheckStatus, Task } from './types'
import { isArtifactResult, isCheckResult, isDeliverableResult } from './rule-kinds'

/** 任务列表/详情共用的运行进度结构 */
export type TaskProgress = {
  done: number
  total: number
  ruleKey: string
  ruleName: string
  status: string
  error?: string
  phase?: string
  phaseName?: string
  phaseIndex?: number
  phaseCount?: number
  queued?: boolean
}

export type TaskRow = Task & { progress: TaskProgress | null }

/**
 * 状态 Tab 计数：
 * - all：检测 + 合同文案（不含功能产物）
 * - verify：仅合同文案的待验收
 * - pass / warn / fail / skip：仅自动检测
 */
export function statusCounts(results: CheckResult[], key: CheckStatus | 'all'): number {
  if (key === 'all') return results.filter((r) => !isArtifactResult(r)).length
  if (key === 'verify') {
    return results.filter((r) => isDeliverableResult(r) && r.status === 'verify').length
  }
  return results.filter((r) => isCheckResult(r) && r.status === key).length
}

/** 按页面 URL 分组（空 URL 归入首页组），保持结果顺序 */
export function groupResultsByPage(results: CheckResult[]): Map<string, CheckResult[]> {
  const groups = new Map<string, CheckResult[]>()
  for (const r of results) {
    const key = r.pageUrl || ''
    const arr = groups.get(key) ?? []
    arr.push(r)
    groups.set(key, arr)
  }
  return groups
}

/** 结果筛选 Tab（全部/通过/失败/跳过/待验收） */
export const STATUS_FILTERS: ReadonlyArray<{ key: CheckStatus | 'all'; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'pass', label: '通过' },
  { key: 'fail', label: '失败' },
  { key: 'skip', label: '跳过' },
  { key: 'verify', label: '待验收' }
]

/** PageSpeed 截图地址（含版本号，上传替换后可强制刷新） */
export function psShotUrl(taskId: number | null, strategy: 'mobile' | 'desktop', version: number): string {
  return taskId ? `/api/screenshots/task-${taskId}/pagespeed-${strategy}.png?v=${version}` : ''
}

/** ISO 时间 → 简短本地时间（MM-DD HH:mm），空值/异常显示 — */
export function fmtTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}
