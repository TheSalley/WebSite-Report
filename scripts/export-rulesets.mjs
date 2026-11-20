/**
 * 导出规则集为 JSON。
 *
 *   npm run rulesets:export                          # 导出本地库
 *   npm run rulesets:export -- --from root@1.2.3.4   # 导出线上库（自动定位 reports.db）
 *   npm run rulesets:export -- --out my-rules.json   # 指定输出文件
 *   npm run rulesets:export -- --set 网站交付检查      # 只导出一个规则集
 */
import { writeFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseTarget, localDbFile, openDb, findRemoteDb, downloadDb, cleanup, stamp } from './lib/ruleset-transfer.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const value = (flag) => {
  const i = argv.indexOf(flag)
  return i >= 0 ? argv[i + 1] : undefined
}
const DRY_RUN = argv.includes('--dry-run')
const SOURCE = value('--from')
const OUT = value('--out')
const ONLY_SET = value('--set')

function readRuleSets(dbFile) {
  const db = openDb(dbFile, true)
  try {
    const sets = db
      .prepare('SELECT id, name, description, isBuiltin, scanPages FROM rule_sets ORDER BY isBuiltin DESC, id')
      .all()
    return sets
      .filter((s) => !ONLY_SET || s.name === ONLY_SET)
      .map((s) => ({
        name: s.name,
        description: s.description ?? '',
        isBuiltin: Boolean(s.isBuiltin),
        scanPages: Boolean(s.scanPages),
        rules: db
          .prepare(
            `SELECT ruleKey, groupName, name, enabled, description, deliverable, scope, kind, params, sortOrder
             FROM rules WHERE ruleSetId = ? ORDER BY sortOrder, id`
          )
          .all(s.id)
          .map((r) => ({
            ruleKey: r.ruleKey,
            groupName: r.groupName,
            name: r.name,
            enabled: Boolean(r.enabled),
            description: r.description ?? '',
            deliverable: r.deliverable ?? '',
            scope: r.scope ?? 'page',
            kind: r.kind ?? 'check',
            params: parseParams(r.params),
            sortOrder: Number(r.sortOrder ?? 0)
          }))
      }))
  } finally {
    db.close()
  }
}

function parseParams(raw) {
  try {
    const v = JSON.parse(String(raw ?? '{}'))
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}

function main() {
  const target = parseTarget(SOURCE)
  let dbFile = localDbFile(ROOT)
  let tempDir = null
  let label = dbFile
  if (target.remote) {
    const remotePath = target.dbPath || findRemoteDb(target.host)
    console.log(`拉取 ${target.host}:${remotePath} ...`)
    const dl = downloadDb(target.host, remotePath)
    tempDir = dl.dir
    dbFile = dl.file
    label = `${target.host}:${remotePath}`
  }

  try {
    const sets = readRuleSets(dbFile)
    if (sets.length === 0) throw new Error(ONLY_SET ? `没有名为「${ONLY_SET}」的规则集` : '数据库里没有规则集')
    const ruleCount = sets.reduce((n, s) => n + s.rules.length, 0)
    const payload = {
      format: 'web-report-rulesets',
      version: 1,
      exportedAt: new Date().toISOString(),
      source: label,
      ruleSets: sets
    }
    const outFile = resolve(OUT ?? join(ROOT, `rulesets-${stamp()}.json`))
    if (DRY_RUN) {
      console.log(JSON.stringify(payload, null, 2))
      console.log(`\n[DRY-RUN] 未写入文件。将导出 ${sets.length} 个规则集 / ${ruleCount} 条规则。`)
      return
    }
    writeFileSync(outFile, JSON.stringify(payload, null, 2) + '\n', 'utf8')
    console.log(`已导出 ${sets.length} 个规则集 / ${ruleCount} 条规则`)
    for (const s of sets) console.log(`  - ${s.name}（${s.rules.length} 条）`)
    console.log(`\n文件：${outFile}`)
  } finally {
    cleanup(tempDir)
  }
}

try {
  main()
} catch (err) {
  console.error('\n[export] 失败：' + err.message)
  process.exit(1)
}
