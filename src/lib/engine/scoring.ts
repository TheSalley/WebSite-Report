import type { CheckStatus, Severity } from '../types'

/** 各严重级别的权重 */
export const SEVERITY_WEIGHT: Record<Severity, number> = {
  critical: 3,
  warning: 2,
  suggest: 1
}

export type TaskConclusion = 'pass' | 'warn' | 'fail'

export interface ScoreResult {
  score: number
  passCount: number
  warnCount: number
  failCount: number
  skipCount: number
  verifyCount: number
  conclusion: TaskConclusion
}

/**
 * 计算得分（100 分制）：
 * - 权重：必须 3 / 警告 2 / 建议 1
 * - pass = 全权重；warn = 半权重；fail/skip = 0
 * - 结论：任一必须项失败 → fail；否则有警告 → warn；否则 pass
 */
export function computeScore(results: { status: CheckStatus; severity: Severity }[]): ScoreResult {
  let totalWeight = 0
  let gained = 0
  let passCount = 0
  let warnCount = 0
  let failCount = 0
  let skipCount = 0
  let verifyCount = 0
  let criticalFailed = false

  for (const r of results) {
    const w = SEVERITY_WEIGHT[r.severity] ?? 1
    if (r.status === 'verify') {
      verifyCount++
      continue
    }
    totalWeight += w
    switch (r.status) {
      case 'pass':
        gained += w
        passCount++
        break
      case 'warn':
        gained += w * 0.5
        warnCount++
        break
      case 'fail':
        if (r.severity === 'critical') criticalFailed = true
        failCount++
        break
      case 'skip':
        skipCount++
        break
    }
  }

  const score = totalWeight > 0 ? Math.round((100 * gained) / totalWeight) : 0
  const conclusion: TaskConclusion = criticalFailed ? 'fail' : warnCount > 0 || failCount > 0 ? 'warn' : 'pass'

  return { score, passCount, warnCount, failCount, skipCount, verifyCount, conclusion }
}

