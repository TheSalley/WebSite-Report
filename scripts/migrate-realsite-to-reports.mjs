/**
 * 将旧版 web-report-data/realsite.db 的数据合并进 web-report-data/reports.db。
 *
 * 设计原则：
 * - reports.db 是主库，绝不覆盖已有站点/规则/任务/结果/设置。
 * - 站点按 URL 去重；规则集优先按名称+创建时间去重，规则按 ruleSetId+ruleKey 去重。
 * - 任务与结果保留原 ID（若有冲突则顺延），结果里的 ruleId 按 ruleKey 重新映射。
 * - 迁移前对 reports.db 做完整备份，并支持 --dry-run。
 *
 * 用法：
 *   node scripts/migrate-realsite-to-reports.mjs --dry-run
 *   node scripts/migrate-realsite-to-reports.mjs
 */
import { existsSync, mkdirSync, copyFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA_DIR = process.env.WEBREPORT_DATA_DIR ?? join(ROOT, 'web-report-data')
const LEGACY_FILE = join(DATA_DIR, 'realsite.db')
const TARGET_FILE = join(DATA_DIR, 'reports.db')
const BACKUP_DIR = join(DATA_DIR, 'backups')
const MARKER = 'migration.realsiteDb.v1'
const DRY_RUN = process.argv.includes('--dry-run')

const all = (db, sql, ...params) => db.prepare(sql).all(...params)
const one = (db, sql, ...params) => db.prepare(sql).get(...params)
const run = (db, sql, ...params) => db.prepare(sql).run(...params)
const str = (v, fallback = '') => (v == null ? fallback : String(v))
const num = (v) => Number(v)
const uniq = (taken) => {
  let id = 1
  while (taken.has(id)) id++
  taken.add(id)
  return id
}
/** 优先沿用旧 ID；仅在目标库已占用时顺延，保证迁移后引用稳定可预测。 */
const allocate = (preferred, taken) => {
  if (!taken.has(preferred)) {
    taken.add(preferred)
    return preferred
  }
  return uniq(taken)
}
/** 追加到末尾（用于规则集这类按 ID 排序的列表，避免新数据插到最前面）。 */
const allocateNext = (taken) => {
  let id = taken.size ? Math.max(...taken) + 1 : 1
  while (taken.has(id)) id++
  taken.add(id)
  return id
}

/** 结果类型：与 src/lib/rule-kinds.ts 的旧数据推断保持一致 */
function resultKind(row) {
  if (row.kind) return str(row.kind)
  if (row.status === 'verify') return 'deliverable'
  if (str(row.ruleKey).startsWith('artifact.')) return 'artifact'
  return 'check'
}

function backupTarget() {
  mkdirSync(BACKUP_DIR, { recursive: true })
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
  const base = join(BACKUP_DIR, `reports-${stamp}`)
  // 先把 WAL 内容合并回主库，保证备份是完整快照。
  const target = new DatabaseSync(TARGET_FILE)
  try {
    target.exec('PRAGMA wal_checkpoint(TRUNCATE);')
  } finally {
    target.close()
  }
  copyFileSync(TARGET_FILE, base + '.db')
  for (const suffix of ['-wal', '-shm']) {
    if (existsSync(TARGET_FILE + suffix)) copyFileSync(TARGET_FILE + suffix, base + suffix)
  }
  return base + '.db'
}

function main() {
  if (!existsSync(LEGACY_FILE)) throw new Error(`找不到旧数据库：${LEGACY_FILE}`)
  if (!existsSync(TARGET_FILE)) throw new Error(`找不到目标数据库：${TARGET_FILE}`)

  // 先确认是否已经迁移过，避免重复执行时产生无意义的备份。
  if (!DRY_RUN) {
    const probe = new DatabaseSync(TARGET_FILE)
    const done = one(probe, 'SELECT value FROM settings WHERE key = ?', MARKER)
    probe.close()
    if (done) {
      console.log('[migrate] 已迁移过（settings.' + MARKER + ' 存在），无需重复执行。')
      return
    }
  }

  const backup = DRY_RUN ? null : backupTarget()
  const legacy = new DatabaseSync(LEGACY_FILE)
  const target = new DatabaseSync(TARGET_FILE)
  const stats = {
    sites: { inserted: 0, reused: 0 },
    ruleSets: { inserted: 0, reused: 0 },
    rules: { inserted: 0, reused: 0 },
    tasks: { inserted: 0, skipped: 0 },
    results: { inserted: 0, skipped: 0, orphanRule: 0, missingScreenshot: 0 },
    settings: { inserted: 0, kept: 0 }
  }
  const warnings = []

  try {
    target.exec('PRAGMA busy_timeout = 10000; PRAGMA foreign_keys = ON;')
    target.exec('BEGIN IMMEDIATE')

    // ---------- 站点：按 URL 去重，优先保留原 ID ----------
    const siteIds = new Set(all(target, 'SELECT id FROM sites').map((r) => num(r.id)))
    const siteByUrl = new Map(all(target, 'SELECT id, url FROM sites').map((r) => [str(r.url), num(r.id)]))
    const siteMap = new Map()
    const oldSites = all(legacy, 'SELECT * FROM sites ORDER BY id')

    const insertSite = (row, id) => {
      run(
        target,
        'INSERT INTO sites (id, name, url, remark, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
        id, str(row.name), str(row.url), str(row.remark), str(row.createdAt), str(row.updatedAt)
      )
      siteIds.add(id)
      siteByUrl.set(str(row.url), id)
      stats.sites.inserted++
      return id
    }

    for (const row of oldSites) {
      const existing = siteByUrl.get(str(row.url))
      if (existing) {
        siteMap.set(num(row.id), existing)
        stats.sites.reused++
      }
    }
    // 先占住目标库中原本空闲的原 ID，减少任务引用改动
    for (const row of oldSites) {
      if (siteMap.has(num(row.id))) continue
      const preferred = num(row.id)
      if (!siteIds.has(preferred)) siteMap.set(preferred, insertSite(row, preferred))
    }
    for (const row of oldSites) {
      if (siteMap.has(num(row.id))) continue
      siteMap.set(num(row.id), insertSite(row, allocate(num(row.id), siteIds)))
    }

    // ---------- 规则集：名称+创建时间去重 ----------
    const ruleSetIds = new Set(all(target, 'SELECT id FROM rule_sets').map((r) => num(r.id)))
    const oldRuleSets = all(legacy, 'SELECT * FROM rule_sets ORDER BY id')
    const targetRuleSets = all(target, 'SELECT * FROM rule_sets')
    const ruleSetMap = new Map()
    const usedNames = new Set()

    for (const row of oldRuleSets) {
      const match = targetRuleSets.find(
        (t) => str(t.name) === str(row.name) && str(t.createdAt) === str(row.createdAt)
      )
      if (match) {
        ruleSetMap.set(num(row.id), num(match.id))
        usedNames.add(str(match.name))
        stats.ruleSets.reused++
      }
    }
    for (const row of oldRuleSets) {
      if (ruleSetMap.has(num(row.id))) continue
      const id = ruleSetIds.has(num(row.id)) ? allocateNext(ruleSetIds) : allocate(num(row.id), ruleSetIds)
      let name = str(row.name)
      if (usedNames.has(name)) name = `${name}（旧库）`
      let suffix = 2
      const baseName = name
      while (usedNames.has(name)) name = `${baseName} ${suffix++}`
      run(
        target,
        `INSERT INTO rule_sets (id, name, description, isBuiltin, parentId, createdAt, updatedAt, scanPages)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        id, name, str(row.description), num(row.isBuiltin), row.parentId == null ? null : num(row.parentId),
        str(row.createdAt), str(row.updatedAt), 0
      )
      usedNames.add(name)
      ruleSetMap.set(num(row.id), id)
      stats.ruleSets.inserted++
    }

    // ---------- 规则：按 ruleSetId + ruleKey 去重 ----------
    // 除已有规则 ID 外，也避开旧结果里引用过的 ID；否则迁移后那些历史孤儿引用会被「重新解释」成新规则。
    const ruleIds = new Set([
      ...all(target, 'SELECT id FROM rules').map((r) => num(r.id)),
      ...all(target, 'SELECT DISTINCT ruleId FROM check_results WHERE ruleId IS NOT NULL').map((r) => num(r.ruleId))
    ])
    const ruleMap = new Map() // 旧规则 id -> 新规则 id
    const newRuleByKey = new Map()
    for (const r of all(target, 'SELECT id, ruleSetId, ruleKey FROM rules')) {
      newRuleByKey.set(num(r.ruleSetId) + '|' + str(r.ruleKey), num(r.id))
    }

    for (const row of all(legacy, 'SELECT * FROM rules ORDER BY id')) {
      const newSetId = ruleSetMap.get(num(row.ruleSetId))
      if (!newSetId) {
        warnings.push(`规则 ${row.id} 的规则集 ${row.ruleSetId} 未映射，已跳过`)
        continue
      }
      const key = newSetId + '|' + str(row.ruleKey)
      const existing = newRuleByKey.get(key)
      if (existing) {
        ruleMap.set(num(row.id), existing)
        stats.rules.reused++
        continue
      }
      const id = allocate(num(row.id), ruleIds)
      run(
        target,
        `INSERT INTO rules (id, ruleSetId, groupName, ruleKey, name, enabled, description, deliverable, scope, kind, params, sortOrder)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id, newSetId, str(row.groupName), str(row.ruleKey), str(row.name), num(row.enabled ?? 1),
        row.description == null ? null : str(row.description),
        row.deliverable == null ? null : str(row.deliverable),
        str(row.scope, 'page') || 'page',
        str(row.kind) || (str(row.ruleKey).startsWith('verify.') ? 'deliverable' : str(row.ruleKey).startsWith('artifact.') ? 'artifact' : 'check'),
        str(row.params, '{}') || '{}',
        num(row.sortOrder ?? 0)
      )
      newRuleByKey.set(key, id)
      ruleMap.set(num(row.id), id)
      stats.rules.inserted++
    }

    // ---------- 任务：保留原 ID，冲突则顺延 ----------
    const taskIds = new Set(all(target, 'SELECT id FROM tasks').map((r) => num(r.id)))
    const taskMap = new Map()
    const hasTask = (id) => one(target, 'SELECT 1 AS ok FROM tasks WHERE id = ?', id)
    const taskCols = new Set(all(target, 'PRAGMA table_info(tasks)').map((c) => str(c.name)))
    const pageSetCol = taskCols.has('pageSetJson') ? ', pageSetJson' : ''
    const siteDataCol = taskCols.has('siteDataJson') ? ', siteDataJson' : ''
    const pageSetVal = taskCols.has('pageSetJson') ? ', ?' : ''
    const siteDataVal = taskCols.has('siteDataJson') ? ', ?' : ''

    for (const row of all(legacy, 'SELECT * FROM tasks ORDER BY id')) {
      const existing = hasTask(num(row.id))
      if (existing) {
        taskMap.set(num(row.id), num(row.id))
        stats.tasks.skipped++
        continue
      }
      const id = allocate(num(row.id), taskIds)
      const siteId = siteMap.get(num(row.siteId))
      const ruleSetId = ruleSetMap.get(num(row.ruleSetId))
      if (!siteId || !ruleSetId) {
        warnings.push(`任务 ${row.id} 的站点/规则集未映射（site ${row.siteId}, ruleset ${row.ruleSetId}），已跳过`)
        continue
      }
      const values = [
        id, siteId, ruleSetId, str(row.status),
        row.score == null ? null : num(row.score),
        num(row.passCount ?? 0), num(row.warnCount ?? 0), num(row.failCount ?? 0),
        num(row.skipCount ?? 0), num(row.verifyCount ?? 0),
        row.startedAt == null ? null : str(row.startedAt),
        row.finishedAt == null ? null : str(row.finishedAt),
        row.pagespeedJson == null ? null : str(row.pagespeedJson),
        row.error == null ? null : str(row.error)
      ]
      if (taskCols.has('pageSetJson')) values.push(row.pageSetJson == null ? null : str(row.pageSetJson))
      if (taskCols.has('siteDataJson')) values.push(row.siteDataJson == null ? null : str(row.siteDataJson))
      run(
        target,
        `INSERT INTO tasks (id, siteId, ruleSetId, status, score, passCount, warnCount, failCount, skipCount, verifyCount, startedAt, finishedAt, pagespeedJson, error${pageSetCol}${siteDataCol})
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?${pageSetVal}${siteDataVal})`,
        ...values
      )
      taskMap.set(num(row.id), id)
      stats.tasks.inserted++
    }

    // ---------- 检测结果：保留原 ID，ruleId 重新映射 ----------
    const resultIds = new Set(all(target, 'SELECT id FROM check_results').map((r) => num(r.id)))
    const taskSiteUrl = new Map(
      all(target, 'SELECT t.id AS taskId, s.url AS url FROM tasks t JOIN sites s ON s.id = t.siteId').map((r) => [num(r.taskId), str(r.url)])
    )
    const screenshotRoot = join(DATA_DIR, 'screenshots')
    const taskRuleSet = new Map(
      all(target, 'SELECT id, ruleSetId FROM tasks').map((r) => [num(r.id), num(r.ruleSetId)])
    )

    for (const row of all(legacy, 'SELECT * FROM check_results ORDER BY id')) {
      const newTaskId = taskMap.get(num(row.taskId))
      if (!newTaskId) {
        warnings.push(`结果 ${row.id} 的任务 ${row.taskId} 未迁移，已跳过`)
        stats.results.skipped++
        continue
      }
      if (one(target, 'SELECT 1 AS ok FROM check_results WHERE id = ?', num(row.id))) {
        stats.results.skipped++
        continue
      }
      const id = allocate(num(row.id), resultIds)
      // 旧库的结果可能指向更早版本的规则 ID；优先按 ID 映射，失败则按「规则集 + ruleKey」回退。
      const ruleSetId = taskRuleSet.get(newTaskId)
      const ruleId =
        (row.ruleId == null ? null : ruleMap.get(num(row.ruleId)) ?? null) ??
        (ruleSetId == null ? null : newRuleByKey.get(ruleSetId + '|' + str(row.ruleKey)) ?? null)
      if (row.ruleId != null && ruleId == null) {
        stats.results.orphanRule++
        warnings.push(`结果 ${row.id} 的规则 ${row.ruleId}（${row.ruleKey}）在新库无对应规则，ruleId 置空`)
      }
      const screenshotPath = row.screenshotPath == null ? null : str(row.screenshotPath)
      if (screenshotPath && !existsSync(join(screenshotRoot, screenshotPath))) {
        stats.results.missingScreenshot++
      }
      const pageUrl = str(row.pageUrl) || taskSiteUrl.get(newTaskId) || ''
      run(
        target,
        `INSERT INTO check_results (id, taskId, ruleId, ruleKey, ruleName, groupName, kind, pageUrl, status, actualValue, expectedValue, description, deliverable, screenshotPath, note, checkedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id, newTaskId, ruleId, str(row.ruleKey), str(row.ruleName), str(row.groupName),
        resultKind(row), pageUrl, str(row.status), str(row.actualValue), str(row.expectedValue),
        str(row.description), str(row.deliverable), screenshotPath, str(row.note), str(row.checkedAt)
      )
      stats.results.inserted++
    }

    // ---------- 设置：只补缺失键，不覆盖现有配置 ----------
    for (const row of all(legacy, 'SELECT key, value FROM settings ORDER BY key')) {
      const key = str(row.key)
      if (one(target, 'SELECT 1 AS ok FROM settings WHERE key = ?', key)) {
        stats.settings.kept++
        continue
      }
      run(target, 'INSERT INTO settings (key, value) VALUES (?, ?)', key, str(row.value))
      stats.settings.inserted++
    }

    if (!DRY_RUN) {
      run(target, "INSERT OR REPLACE INTO settings (key, value) VALUES (?, '1')", MARKER)
      target.exec('COMMIT')
    } else {
      target.exec('ROLLBACK')
    }

    console.log(`[migrate] ${DRY_RUN ? '空跑完成（未写入）' : '迁移完成'}${backup ? `，备份：${backup}` : ''}`)
    console.table(stats)
    if (warnings.length) {
      console.log(`[migrate] 警告 ${warnings.length} 条：`)
      for (const w of warnings.slice(0, 50)) console.log(' - ' + w)
      if (warnings.length > 50) console.log(` - ... 其余 ${warnings.length - 50} 条省略`)
    }
  } catch (err) {
    try { target.exec('ROLLBACK') } catch {}
    throw err
  } finally {
    legacy.close()
    target.close()
  }
}

main()
