import type { CheckStatus } from '../types'

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
 * 计算得分（100 分制，等权）：
 * - 每项 pass = 1 分；warn = 0.5 分；fail/skip = 0 分；verify 不计入
 * - 结论：任一失败 → fail；否则有警告 → warn；否则 pass
 */
export function computeScore(results: { status: CheckStatus }[]): ScoreResult {
  let total = 0
  let gained = 0
  let passCount = 0
  let warnCount = 0
  let failCount = 0
  let skipCount = 0
  let verifyCount = 0

  for (const r of results) {
    if (r.status === 'verify') {
      verifyCount++
      continue
    }
    total++
    switch (r.status) {
      case 'pass':
        gained += 1
        passCount++
        break
      case 'warn':
        gained += 0.5
        warnCount++
        break
      case 'fail':
        failCount++
        break
      case 'skip':
        skipCount++
        break
    }
  }

  const score = total > 0 ? Math.round((100 * gained) / total) : 0
  const conclusion: TaskConclusion = failCount > 0 ? 'fail' : warnCount > 0 || failCount > 0 ? 'warn' : 'pass'

  return { score, passCount, warnCount, failCount, skipCount, verifyCount, conclusion }
}

