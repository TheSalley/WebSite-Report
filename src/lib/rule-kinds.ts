import type { CheckResult, RuleKind } from './types'

/** 旧数据兼容：检测结果没有 kind 时按状态/前缀推断。 */
export function resultKind(result: Pick<CheckResult, 'kind' | 'ruleKey' | 'status'>): RuleKind {
  if (result.kind) return result.kind
  if (result.status === 'verify') return 'deliverable'
  if (result.ruleKey.startsWith('artifact.')) return 'artifact'
  return 'check'
}

/** 是否为机器检测项 */
export function isCheckResult(result: Pick<CheckResult, 'kind' | 'ruleKey' | 'status'>): boolean {
  return resultKind(result) === 'check'
}

/** 是否为合同文案 / 人工验收项 */
export function isDeliverableResult(result: Pick<CheckResult, 'kind' | 'ruleKey' | 'status'>): boolean {
  return resultKind(result) === 'deliverable'
}

/** 是否为功能产物（截图等），不参与评分 */
export function isArtifactResult(result: Pick<CheckResult, 'kind' | 'ruleKey' | 'status'>): boolean {
  return resultKind(result) === 'artifact'
}
