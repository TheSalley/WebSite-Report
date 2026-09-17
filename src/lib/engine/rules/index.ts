import type { RuleHandler } from '../types'
import { seoRules } from './seo'
import { perfRules } from './perf'
import { securityRules } from './security'
import { contentRules } from './content'
import { complianceRules } from './compliance'
import { contractRules } from './contract'

/** 规则注册表：ruleKey -> 处理器 */
const registry = new Map<string, RuleHandler>()

function register(rules: Record<string, RuleHandler>): void {
  Object.entries(rules).forEach(([key, handler]) => registry.set(key, handler))
}

// 注册全部内置规则
register(seoRules)
register(perfRules)
register(securityRules)
register(contentRules)
register(complianceRules)
register(contractRules)

/** 是否有该规则的实现 */
export function hasRule(ruleKey: string): boolean {
  return registry.has(ruleKey)
}

/** 获取规则处理器（无实现返回 null，调用方按“未执行”处理） */
export function getRuleHandler(ruleKey: string): RuleHandler | null {
  return registry.get(ruleKey) ?? null
}

/** 全部已注册的规则 key */
export function listRuleKeys(): string[] {
  return Array.from(registry.keys())
}
