import { DATA_DIR, listRuleSets, createRuleSet, listRules, listRulesForSet, replaceRules, updateRuleSet } from './store'
import { BUILTIN_RULE_SETS, DELIVERABLE_PRESETS, toRuleRows } from './seed'
import { logInfo } from './logger'
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
    const rs = await createRuleSet({ name: def.name, description: def.description, isBuiltin: true, scanPages: def.scanPages })
    const rows = toRuleRows(rs.id, def.rules, maxRuleId + 1)
    maxRuleId += rows.length
    await replaceRules(rs.id, rows)
  }

  // 内置规则集已存在时，同步种子里的多页面开关：网站交付检查固定开启、建站服务合同验收固定关闭（与现有 DB 对齐）
  const ruleSets = await listRuleSets()
  for (const def of BUILTIN_RULE_SETS) {
    if (def.scanPages === undefined) continue
    const rs = ruleSets.find((x) => x.name === def.name)
    if (rs && rs.scanPages !== def.scanPages) {
      await updateRuleSet(rs.id, { scanPages: def.scanPages })
    }
  }

  // 内置规则集已存在时，补齐种子中新增的内置规则（按 ruleKey 判断，不覆盖已有规则；新规则追加到最后）
  for (const def of BUILTIN_RULE_SETS) {
    const rs = ruleSets.find((x) => x.name === def.name)
    if (!rs || !rs.isBuiltin) continue
    const existingKeys = new Set((await listRulesForSet(rs.id)).map((r) => r.ruleKey))
    const missing = def.rules.filter((seed) => !existingKeys.has(seed.ruleKey))
    if (missing.length === 0) continue
    const rows = await listRulesForSet(rs.id)
    const maxSort = rows.reduce((m, r) => Math.max(m, r.sortOrder), 0)
    const added = missing.map((seed, idx) => ({
      ruleSetId: rs.id,
      groupName: seed.groupName,
      ruleKey: seed.ruleKey,
      name: seed.name,
      enabled: true,
      description: seed.description,
      deliverable: seed.deliverable && seed.deliverable.trim() ? seed.deliverable : DELIVERABLE_PRESETS[seed.ruleKey] ?? '',
      scope: seed.scope ?? 'page',
      params: seed.params ?? {},
      sortOrder: maxSort + 1 + idx
    }))
    await replaceRules(rs.id, [...rows, ...added])
    logInfo(`内置规则集「${rs.name}」补齐 ${added.length} 条新增规则`)
  }

  // 内置规则集已存在时，同步种子中规则的执行范围 scope（功能属性；不影响用户自定义的启用/描述/交付成果）
  for (const def of BUILTIN_RULE_SETS) {
    const rs = ruleSets.find((x) => x.name === def.name)
    if (!rs) continue
    const scopeByKey = new Map<string, 'page' | 'site'>()
    for (const seed of def.rules) {
      if (seed.scope) scopeByKey.set(seed.ruleKey, seed.scope)
    }
    if (scopeByKey.size === 0) continue
    const rows = await listRulesForSet(rs.id)
    const updated = rows.map((r) =>
      scopeByKey.has(r.ruleKey) && r.scope !== scopeByKey.get(r.ruleKey) ? { ...r, scope: scopeByKey.get(r.ruleKey) } : r
    )
    if (updated.some((r, i) => r.scope !== rows[i].scope)) {
      await replaceRules(rs.id, updated)
      logInfo(`内置规则集「${rs.name}」同步 ${scopeByKey.size} 条规则的执行范围`)
    }
  }

  // 内置规则集已存在时，同步种子中规则的显示名称与分组（内置规则名称界面只读、以种子为准；不影响启用/描述/交付成果）
  for (const def of BUILTIN_RULE_SETS) {
    const rs = ruleSets.find((x) => x.name === def.name)
    if (!rs || !rs.isBuiltin) continue
    const metaByKey = new Map<string, { name: string; groupName: string }>()
    for (const seed of def.rules) metaByKey.set(seed.ruleKey, { name: seed.name, groupName: seed.groupName })
    const rows = await listRulesForSet(rs.id)
    const updated = rows.map((r) => {
      const meta = metaByKey.get(r.ruleKey)
      if (!meta) return r
      const name = r.name !== meta.name ? meta.name : r.name
      const groupName = r.groupName !== meta.groupName ? meta.groupName : r.groupName
      return name === r.name && groupName === r.groupName ? r : { ...r, name, groupName }
    })
    if (updated.some((r, i) => r.name !== rows[i].name || r.groupName !== rows[i].groupName)) {
      await replaceRules(rs.id, updated)
      logInfo(`内置规则集「${rs.name}」同步规则名称/分组`)
    }
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

