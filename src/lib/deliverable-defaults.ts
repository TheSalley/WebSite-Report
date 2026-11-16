/**
 * 合同文案默认跳过人工验收的规则。
 * 这些交付项属于合同承诺，无法逐项在页面上验证，生成结果时默认标记为「跳过」，
 * 仍可在任务详情中手动改回「待验收」并记录交付情况。
 */
export const SKIP_BY_DEFAULT_RULE_KEYS: ReadonlySet<string> = new Set([
  'verify.plan.strategy',
  'verify.plan.cycle',
  'verify.build.banner',
  'content.viewport',
  'contract.contact',
  'contract.search',
  'compliance.privacy',
  'verify.build.thanks',
  'contract.ga',
  'security.https',
  'verify.optimize.html',
  'verify.optimize.server',
  'verify.optimize.firewall',
  'verify.optimize.cdn',
  'verify.admin.news',
  'verify.admin.product',
  'verify.admin.files',
  'verify.admin.youtube',
  'verify.admin.mail',
  'verify.admin.onboard',
  'verify.content.fill',
  'verify.support.inspection',
  'verify.support.bugfix',
  'verify.support.perf',
  'verify.support.ssl',
  'verify.support.security',
  'verify.support.training',
  'verify.support.content',
  'verify.support.rollback',
  'verify.support.source'
])

/** 合同文案的默认结果状态：默认跳过，其余待验收 */
export function skipByDefault(ruleKey: string): boolean {
  return SKIP_BY_DEFAULT_RULE_KEYS.has(ruleKey)
}
