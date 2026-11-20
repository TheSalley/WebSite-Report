/**
 * 从 JSON 导入规则集。
 *
 *   npm run rulesets:import -- rulesets-20261120-173001.json
 *   npm run rulesets:import -- rules.json --to root@1.2.3.4:/opt/app/web-report-data/reports.db
 *   npm run rulesets:import -- rules.json --replace      # 覆盖同名规则集（默认只更新，不删多余规则）
 *   npm run rulesets:import -- rules.json --dry-run      # 只看差异
 *
 * 同步策略：
 * - 规则集按名称匹配：不存在则新建，存在则更新说明/scanPages；
 * - 规则按 ruleKey 匹配：不存在则新增，存在则更新字段，并保留原 id（历史结果不失效）；
 * - 启停状态以导出文件为准，保证线上与导出时完全一致；
 * - 文件里没有、但库里存在的额外规则保留不删；加 --replace 才删除。
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseTarget, localDbFile, openDb, backup, downloadDb, uploadDb, restartWebReport, cleanup } from './lib/ruleset-transfer.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const positional = []
let to = undefined
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--to') { to = argv[++i]; continue }
  if (a.startsWith('--')) { continue }
  positional.push(a)
}
const DRY_RUN = argv.includes('--dry-run')
const REPLACE = argv.includes('--replace')
const NO_RESTART = argv.includes('--no-restart')
const FILE = positional[0]

const FORMAT = 'web-report-rulesets'

const str = (v) => (v == null ? '' : String(v))
const show = (v) => JSON.stringify(v ?? '')

function loadPayload(file) {
  const abs = resolve(file)
  if (!existsSync(abs)) throw new Error(`找不到文件：${abs}`)
  let data
  try {
    data = JSON.parse(readFileSync(abs, 'utf8'))
  } catch (err) {
    throw new Error('JSON 解析失败：' + err.message)
  }
  if (data?.format !== FORMAT || !Array.isArray(data.ruleSets)) {
    throw new Error(`格式不正确，应为本工具的导出文件（format=${FORMAT}）`)
  }
  return data
}

/** 校验并规范化，避免脏数据写库 */
function normalizeRuleSets(payload) {
  return payload.ruleSets.map((set, si) => {
    const name = str(set.name).trim()
    if (!name) throw new Error(`第 ${si + 1} 个规则集缺少 name`)
    const rules = (Array.isArray(set.rules) ? set.rules : []).map((r, ri) => {
      const ruleKey = str(r.ruleKey).trim()
      if (!ruleKey) throw new Error(`规则集「${name}」第 ${ri + 1} 条规则缺少 ruleKey`)
      return {
        ruleKey,
        groupName: str(r.groupName) || '未分组',
        name: str(r.name) || ruleKey,
        enabled: r.enabled === undefined ? true : Boolean(r.enabled),
        description: str(r.description),
        deliverable: str(r.deliverable),
        scope: str(r.scope) === 'site' ? 'site' : 'page',
        kind: ['check', 'deliverable', 'artifact'].includes(str(r.kind)) ? str(r.kind) : 'check',
        params: r.params && typeof r.params === 'object' ? r.params : {},
        sortOrder: Number.isFinite(Number(r.sortOrder)) ? Number(r.sortOrder) : ri
      }
    })
    // ruleKey 去重：保留第一条，避免同组重复导致引擎重复执行
    const seen = new Set()
    const deduped = []
    for (const r of rules) {
      if (seen.has(r.ruleKey)) {
        console.warn(`  ! 规则集「${name}」存在重复 ruleKey，已忽略：${r.ruleKey}`)
        continue
      }
      seen.add(r.ruleKey)
      deduped.push(r)
    }
    return {
      name,
      description: str(set.description),
      isBuiltin: set.isBuiltin === undefined ? true : Boolean(set.isBuiltin),
      scanPages: Boolean(set.scanPages),
      rules: deduped
    }
  })
}

function apply(dbFile, sets) {
  const db = openDb(dbFile)
  const stats = { sets: { created: 0, updated: 0 }, rules: { inserted: 0, updated: 0, removed: 0, unchanged: 0 } }
  try {
    db.exec('BEGIN IMMEDIATE')
    let nextSetId = Number(db.prepare('SELECT COALESCE(MAX(id), 0) m FROM rule_sets').get().m)
    let nextRuleId = Number(db.prepare('SELECT COALESCE(MAX(id), 0) m FROM rules').get().m)
    const ts = new Date().toISOString()
    const insertSet = db.prepare(
      'INSERT INTO rule_sets (id, name, description, isBuiltin, scanPages, parentId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, NULL, ?, ?)'
    )
    const updateSet = db.prepare('UPDATE rule_sets SET description = ?, scanPages = ?, updatedAt = ? WHERE id = ?')
    const insertRule = db.prepare(
      'INSERT INTO rules (id, ruleSetId, groupName, ruleKey, name, enabled, description, deliverable, scope, kind, params, sortOrder) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    const updateRule = db.prepare(
      'UPDATE rules SET groupName = ?, name = ?, description = ?, deliverable = ?, scope = ?, kind = ?, params = ?, sortOrder = ? WHERE id = ?'
    )

    for (const set of sets) {
      console.log(`\n== ${set.name}`)
      let row = db.prepare('SELECT * FROM rule_sets WHERE name = ? ORDER BY isBuiltin DESC, id LIMIT 1').get(set.name)
      if (!row) {
        nextSetId += 1
        insertSet.run(nextSetId, set.name, set.description, set.isBuiltin ? 1 : 0, set.scanPages ? 1 : 0, ts, ts)
        row = { id: nextSetId, description: '', scanPages: 0 }
        stats.sets.created += 1
        console.log(`  + 新建规则集（id=${nextSetId}）`)
      } else {
        const diffs = []
        if (str(row.description) !== set.description) diffs.push(`description: ${show(row.description)} -> ${show(set.description)}`)
        if ((Number(row.scanPages) ? 1 : 0) !== (set.scanPages ? 1 : 0)) diffs.push(`scanPages: ${Number(row.scanPages) ? 1 : 0} -> ${set.scanPages ? 1 : 0}`)
        if (diffs.length) {
          updateSet.run(set.description, set.scanPages ? 1 : 0, ts, row.id)
          stats.sets.updated += 1
          console.log(`  ~ 更新规则集（id=${row.id}）\n      ` + diffs.join('\n      '))
        }
      }

      const existing = db
        .prepare('SELECT * FROM rules WHERE ruleSetId = ? ORDER BY sortOrder, id')
        .all(row.id)
      const byKey = new Map(existing.map((r) => [str(r.ruleKey), r]))

      for (const r of set.rules) {
        const cur = byKey.get(r.ruleKey)
        if (!cur) {
          nextRuleId += 1
          insertRule.run(
            nextRuleId, row.id, r.groupName, r.ruleKey, r.name, r.enabled ? 1 : 0,
            r.description || null, r.deliverable || null, r.scope, r.kind, JSON.stringify(r.params), r.sortOrder
          )
          stats.rules.inserted += 1
          console.log(`  + 新增 ${r.ruleKey}（${r.name}）`)
          continue
        }
        const pairs = [
          ['groupName', cur.groupName, r.groupName],
          ['name', cur.name, r.name],
          ['description', cur.description, r.description || null],
          ['deliverable', cur.deliverable, r.deliverable || null],
          ['scope', cur.scope, r.scope],
          ['kind', cur.kind, r.kind],
          ['params', cur.params, JSON.stringify(r.params)],
          ['sortOrder', cur.sortOrder, r.sortOrder],
          ['enabled', Number(cur.enabled) ? 1 : 0, r.enabled ? 1 : 0]
        ]
        const diffs = pairs.filter(([, a, b]) => str(a) !== str(b)).map(([k, a, b]) => `${k}: ${show(a)} -> ${show(b)}`)
        if (diffs.length === 0) {
          stats.rules.unchanged += 1
          continue
        }
        updateRule.run(r.groupName, r.name, r.description || null, r.deliverable || null, r.scope, r.kind, JSON.stringify(r.params), r.sortOrder, cur.id)
        if (pairs.find(([k]) => k === 'enabled')[1] !== (r.enabled ? 1 : 0)) {
          db.prepare('UPDATE rules SET enabled = ? WHERE id = ?').run(r.enabled ? 1 : 0, cur.id)
        }
        stats.rules.updated += 1
        console.log(`  ~ 更新 ${r.ruleKey}（id=${cur.id}）\n      ` + diffs.join('\n      '))
      }

      if (REPLACE) {
        const wanted = new Set(set.rules.map((r) => r.ruleKey))
        for (const rowRule of existing) {
          if (wanted.has(str(rowRule.ruleKey))) continue
          db.prepare('DELETE FROM rules WHERE id = ?').run(rowRule.id)
          stats.rules.removed += 1
          console.log(`  - 删除 ${rowRule.ruleKey}（id=${rowRule.id}）`)
        }
      }
    }

    db.exec(DRY_RUN ? 'ROLLBACK' : 'COMMIT')
  } catch (err) {
    try { db.exec('ROLLBACK') } catch { /* ignore */ }
    throw err
  } finally {
    db.close()
  }
  return stats
}

function summary(stats, label) {
  const total = stats.rules.inserted + stats.rules.updated + stats.rules.removed + stats.sets.created + stats.sets.updated
  if (total === 0) {
    console.log('\n已是最新，无需变更')
    return
  }
  console.log(`\n${label}：规则集 新建 ${stats.sets.created} / 更新 ${stats.sets.updated}，规则 新增 ${stats.rules.inserted} / 更新 ${stats.rules.updated} / 删除 ${stats.rules.removed}，未变化 ${stats.rules.unchanged}`)
}

function main() {
  if (!FILE) throw new Error('请指定导入文件，例如：npm run rulesets:import -- rules.json')
  const payload = loadPayload(FILE)
  const sets = normalizeRuleSets(payload)
  const totalRules = sets.reduce((n, s) => n + s.rules.length, 0)
  console.log(`文件：${resolve(FILE)}（${sets.length} 个规则集 / ${totalRules} 条规则）`)

  const target = parseTarget(to)
  if (!target.remote) {
    const dbFile = localDbFile(ROOT)
    if (!existsSync(dbFile)) throw new Error(`找不到数据库：${dbFile}`)
    console.log(`目标：${dbFile}`)
    const backupFile = DRY_RUN ? null : backup(dbFile)
    if (backupFile) console.log(`备份：${backupFile}`)
    const stats = apply(dbFile, sets)
    summary(stats, DRY_RUN ? '[DRY-RUN] 预览结果' : '完成')
    if (DRY_RUN) console.log('未写入任何变更')
    return
  }

  const remotePath = target.dbPath
  if (!remotePath) throw new Error('远程导入请用 --to host:/path/reports.db 指定数据库路径')
  console.log(`目标：${target.host}:${remotePath}`)
  const dl = downloadDb(target.host, remotePath)
  try {
    const stats = apply(dl.file, sets)
    summary(stats, DRY_RUN ? '[DRY-RUN] 预览结果' : '完成')
    if (DRY_RUN) { console.log('未写入线上数据库'); return }
    const total = stats.rules.inserted + stats.rules.updated + stats.rules.removed + stats.sets.created + stats.sets.updated
    if (total === 0) return
    console.log('\n上传数据库...')
    uploadDb(target.host, remotePath, dl.file)
    if (!NO_RESTART) {
      const services = restartWebReport(target.host)
      console.log(services.length ? `已重启服务：${services.join('、')}` : '未匹配到 web-report 服务，请手动重启应用')
    }
  } finally {
    cleanup(dl.dir)
  }
}

try {
  main()
} catch (err) {
  console.error('\n[import] 失败：' + err.message)
  process.exit(1)
}
