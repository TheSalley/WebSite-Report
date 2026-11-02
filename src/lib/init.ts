import { DATA_DIR, listRuleSets, createRuleSet, replaceRules, getSettings, saveSettings } from './store'
import { BUILTIN_RULE_SETS, toRuleRows } from './seed'
import { logInfo } from './logger'
import { recoverInterruptedTasks } from './task-service'
import { mkdir } from 'fs/promises'
import { join } from 'path'

/** 默认分组只在首次初始化时创建一次；之后不再自动同步，避免覆盖用户修改 */
const SEED_KEY = 'seed.defaultRuleGroups'

/**
 * 应用启动时初始化：
 * - 确保数据目录存在
 * - 恢复中断任务
 * - 首次运行时创建默认规则分组；用户删除或修改后不会再次自动创建
 */
export async function initData(): Promise<void> {
  await mkdir(join(DATA_DIR, 'json'), { recursive: true })
  await mkdir(join(DATA_DIR, 'screenshots'), { recursive: true })

  await recoverInterruptedTasks()

  const settings = await getSettings()
  if (settings[SEED_KEY] === '1') return

  const existing = await listRuleSets()
  if (existing.length === 0) {
    let nextRuleId = 1
    for (const def of BUILTIN_RULE_SETS) {
      const rs = await createRuleSet({
        name: def.name,
        description: def.description,
        isBuiltin: true,
        scanPages: def.scanPages
      })
      const rows = toRuleRows(rs.id, def.rules, nextRuleId)
      nextRuleId += rows.length
      await replaceRules(rs.id, rows)
    }
    const catalogCount = new Set(BUILTIN_RULE_SETS.flatMap((d) => d.rules.map((r) => r.ruleKey))).size
    logInfo(`已创建 ${BUILTIN_RULE_SETS.length} 个默认分组（规则库 ${catalogCount} 条）`)
  }

  await saveSettings({ [SEED_KEY]: '1' })
}
