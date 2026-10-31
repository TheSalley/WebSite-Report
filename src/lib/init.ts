import { DATA_DIR, listRuleSets, createRuleSet, listRules, replaceRules } from './store'
import { BUILTIN_RULE_SETS, toRuleRows } from './seed'
import { mkdir } from 'fs/promises'
import { join } from 'path'

/**
 * 应用启动时初始化：
 * - 确保数据目录存在
 * - 若内置规则集缺失则创建（名称唯一，重复启动幂等）
 */
export async function initData(): Promise<void> {
  await mkdir(join(DATA_DIR, 'json'), { recursive: true })
  await mkdir(join(DATA_DIR, 'screenshots'), { recursive: true })

  const existing = new Set((await listRuleSets()).map((rs) => rs.name))
  const rules = await listRules()
  let maxRuleId = rules.reduce((max, r) => Math.max(max, r.id), 0)

  for (const def of BUILTIN_RULE_SETS) {
    if (existing.has(def.name)) continue
    const rs = await createRuleSet({ name: def.name, description: def.description, isBuiltin: true })
    const rows = toRuleRows(rs.id, def.rules, maxRuleId + 1)
    maxRuleId += rows.length
    await replaceRules(rs.id, rows)
  }

  // 内置规则集已存在时，仅补缺失的 description（不覆盖用户已配置的值）
  const seedByKey = new Map<string, string>()
  for (const def of BUILTIN_RULE_SETS) {
    for (const seed of def.rules) {
      if (seed.description) seedByKey.set(seed.ruleKey, seed.description)
    }
  }
  const merged = await listRules()
  let patched = false
  for (const r of merged) {
    if ((!r.description || !r.description.trim()) && seedByKey.has(r.ruleKey)) {
      r.description = seedByKey.get(r.ruleKey) as string
      patched = true
    }
  }
  if (patched) {
    const sets = await listRuleSets()
    for (const rs of sets) {
      const rows = merged.filter((r) => r.ruleSetId === rs.id)
      if (rows.length > 0) await replaceRules(rs.id, rows)
    }
  }
}

