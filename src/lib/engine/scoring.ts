import type { CheckStatus, RuleKind } from '../types'
import { resultKind } from '../rule-kinds'

export interface ResultCounts {
  passCount: number
  warnCount: number
  failCount: number
  skipCount: number
  verifyCount: number
}

/**
 * 统计任务各状态数量（不计算综合评分）：
 * - 机器检测：计入通过 / 警告 / 失败 / 跳过
 * - 合同文案：不参与通过率，未确认时计入待验收
 * - 功能产物：只留存证据，不计入任何统计
 */
export function countResults(results: { status: CheckStatus; kind?: RuleKind; ruleKey?: string }[]): ResultCounts {
  const counts: ResultCounts = { passCount: 0, warnCount: 0, failCount: 0, skipCount: 0, verifyCount: 0 }
  for (const r of results) {
    const kind = resultKind({ kind: r.kind, ruleKey: r.ruleKey ?? '', status: r.status })
    // 功能产物（如截图）不是检测结论
    if (kind === 'artifact') continue
    // 合同文案只做人工确认，不计入机器检测通过率
    if (kind === 'deliverable') {
      if (r.status === 'verify') counts.verifyCount++
      else if (r.status === 'skip') counts.skipCount++
      continue
    }
    // 机器检测被人工改为「待验收」时，仅计入待验收
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
