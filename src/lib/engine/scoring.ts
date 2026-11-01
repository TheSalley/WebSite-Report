import type { CheckStatus } from '../types'

export interface ResultCounts {
  passCount: number
  warnCount: number
  failCount: number
  skipCount: number
  verifyCount: number
}

/**
 * 统计任务各状态数量（不计算综合评分）：
 * - verify 为人工验收项，仅计数，不参与通过/失败统计
 */
export function countResults(results: { status: CheckStatus }[]): ResultCounts {
  const counts: ResultCounts = { passCount: 0, warnCount: 0, failCount: 0, skipCount: 0, verifyCount: 0 }
  for (const r of results) {
    if (r.status === 'verify') {
      counts.verifyCount++
      continue
    }
    switch (r.status) {
      case 'pass':
        counts.passCount++
        break
      case 'warn':
        counts.warnCount++
        break
      case 'fail':
        counts.failCount++
        break
      case 'skip':
        counts.skipCount++
        break
    }
  }
  return counts
}
