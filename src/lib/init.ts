import { DATA_DIR, listRuleSets, createRuleSet, listRules, listRulesForSet, replaceRules, updateRuleSet } from './store'
import { BUILTIN_RULE_SETS, DELIVERABLE_PRESETS, toRuleRows } from './seed'
import { logInfo } from './logger'
import { recoverInterruptedTasks } from './task-service'
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

  // 服务重启恢复：遗留 running 且本进程未在跑的任务标记为中断，避免永远显示「运行中」
  await recoverInterruptedTasks()

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

  // 内置规则集已存在时，一次性同步种子（多页面开关 / 新增规则 / 名称分组 / 执行范围 / 缺失描述）。
  // 按 diff 写入，不覆盖用户自定义的启用状态、交付成果与已填写的描述。
  const ruleSets = await listRuleSets()
  const seedDescByKey = new Map<string, string>()
  for (const def of BUILTIN_RULE_SETS) {
    for (const seed of def.rules) {
      if (seed.description) seedDescByKey.set(seed.ruleKey, seed.description)
    }
  }

  for (const def of BUILTIN_RULE_SETS) {
    const rs = ruleSets.find((x) => x.name === def.name)
    if (!rs) continue

    // 多页面开关：网站交付检查固定开启、建站服务合同验收固定关闭（与现有 DB 对齐）
    if (def.scanPages !== undefined && rs.scanPages !== def.scanPages) {
      await updateRuleSet(rs.id, { scanPages: def.scanPages })
    }
    if (!rs.isBuiltin) continue

    const rows = await listRulesForSet(rs.id)
    const existingKeys = new Set(rows.map((r) => r.ruleKey))
    const seedByKey = new Map(def.rules.map((seed) => [seed.ruleKey, seed]))

    // 补齐种子中新增的内置规则（按 ruleKey 判断，不覆盖已有规则；新规则追加到最后）
    const missing = def.rules.filter((seed) => !existingKeys.has(seed.ruleKey))
    const maxSort = rows.reduce((m, r) => Math.max(m, r.sortOrder), 0)
    const additions = missing.map((seed, idx) => ({
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
    const full = [...rows, ...additions]

    // 同步种子中的名称与分组（内置规则界面只读、以种子为准）、执行范围 scope、缺失描述（仅补空）
    const updated = full.map((r) => {
      const seed = seedByKey.get(r.ruleKey)
      if (!seed) return r
      const name = seed.name && r.name !== seed.name ? seed.name : r.name
      const groupName = seed.groupName && r.groupName !== seed.groupName ? seed.groupName : r.groupName
      const scope = seed.scope && r.scope !== seed.scope ? seed.scope : r.scope
      const description = (!r.description || !r.description.trim()) && seed.description ? seed.description : r.description
      return name === r.name && groupName === r.groupName && scope === r.scope && description === r.description
        ? r
        : { ...r, name, groupName, scope, description }
    })

    if (updated.some((r, i) => r !== full[i])) {
      await replaceRules(rs.id, updated)
      const synced = updated.filter((r, i) => i >= rows.length || r !== full[i]).length
      logInfo(`内置规则集「${rs.name}」同步种子：新增 ${additions.length} 条、变更 ${synced} 条`)
    }
  }

  // 全部规则集（含用户自定义）的规则描述缺失时，补种子的默认描述（不覆盖已填写的值）
  const merged = await listRules()
  const patched = merged.filter((r) => (!r.description || !r.description.trim()) && seedDescByKey.has(r.ruleKey))
  if (patched.length > 0) {
    for (const r of patched) r.description = seedDescByKey.get(r.ruleKey) as string
    const sets = await listRuleSets()
    for (const rs of sets) {
      const rows = merged.filter((r) => r.ruleSetId === rs.id)
      if (rows.length > 0) await replaceRules(rs.id, rows)
    }
    logInfo(`补齐 ${patched.length} 条规则缺失描述`)
  }

}

