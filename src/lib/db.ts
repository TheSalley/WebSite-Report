import { mkdirSync, readFileSync, existsSync, readdirSync, renameSync } from 'fs'
import { join } from 'path'
import { DatabaseSync } from 'node:sqlite'
import { DELIVERABLE_PRESETS } from './seed'

/** 数据文件存储根目录（本地 web-report-data） */
export const DATA_DIR = process.env.WEBREPORT_DATA_DIR ?? join(process.cwd(), 'web-report-data')

/** SQLite 数据库文件（首次启动自动从旧版数据库/JSON 迁移） */
const DB_FILE = join(DATA_DIR, 'reports.db')

/** 把旧版 realsite.db 迁移为 reports.db，保留已有数据 */
function migrateLegacyDbFile(): void {
  const legacyFile = join(DATA_DIR, 'realsite.db')
  if (!existsSync(legacyFile) || existsSync(DB_FILE)) return

  try {
    // 先将 WAL 内容合并回主数据库，再改名，避免丢失尚未落盘的数据。
    const legacyDb = new DatabaseSync(legacyFile)
    try {
      legacyDb.exec('PRAGMA wal_checkpoint(TRUNCATE);')
    } finally {
      legacyDb.close()
    }
    renameSync(legacyFile, DB_FILE)
    for (const suffix of ['-wal', '-shm']) {
      const sidecar = legacyFile + suffix
      if (existsSync(sidecar)) renameSync(sidecar, DB_FILE + suffix)
    }
    console.info('[db] 已将 realsite.db 迁移为 reports.db')
  } catch (err) {
    console.warn('[db] 旧数据库迁移失败，将继续使用 reports.db：', err)
  }
}

/** SQLite 查询返回的行类型（列名 -> 值） */
export type SqlRow = Record<string, unknown>

let db: DatabaseSync | null = null

export function getDb(): DatabaseSync {
  if (!db) {
    mkdirSync(DATA_DIR, { recursive: true })
    migrateLegacyDbFile()
    db = new DatabaseSync(DB_FILE)
    db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 5000;
      PRAGMA foreign_keys = ON;
    `)
    db.exec(`
      CREATE TABLE IF NOT EXISTS sites (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        remark TEXT NOT NULL DEFAULT '',
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS rule_sets (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        isBuiltin INTEGER NOT NULL DEFAULT 0,
        scanPages INTEGER NOT NULL DEFAULT 0,
        parentId INTEGER,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS rules (
        id INTEGER PRIMARY KEY,
        ruleSetId INTEGER NOT NULL,
        groupName TEXT NOT NULL,
        ruleKey TEXT NOT NULL,
        name TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        description TEXT,
        deliverable TEXT,
        scope TEXT NOT NULL DEFAULT 'page',
        kind TEXT NOT NULL DEFAULT 'check',
        params TEXT NOT NULL DEFAULT '{}',
        sortOrder INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_rules_set ON rules(ruleSetId);
      CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY,
        siteId INTEGER NOT NULL,
        ruleSetId INTEGER NOT NULL,
        status TEXT NOT NULL,
        score REAL,
        passCount INTEGER NOT NULL DEFAULT 0,
        warnCount INTEGER NOT NULL DEFAULT 0,
        failCount INTEGER NOT NULL DEFAULT 0,
        skipCount INTEGER NOT NULL DEFAULT 0,
        verifyCount INTEGER NOT NULL DEFAULT 0,
        startedAt TEXT,
        finishedAt TEXT,
        pagespeedJson TEXT,
        pageSetJson TEXT,
        error TEXT
      );
      CREATE TABLE IF NOT EXISTS check_results (
        id INTEGER PRIMARY KEY,
        taskId INTEGER NOT NULL,
        ruleId INTEGER,
        ruleKey TEXT NOT NULL,
        ruleName TEXT NOT NULL,
        groupName TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'check',
        pageUrl TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL,
        actualValue TEXT NOT NULL DEFAULT '',
        expectedValue TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        deliverable TEXT NOT NULL DEFAULT '',
        screenshotPath TEXT,
        note TEXT NOT NULL DEFAULT '',
        checkedAt TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_results_task ON check_results(taskId);
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY,
        taskId INTEGER,
        level TEXT NOT NULL,
        message TEXT NOT NULL,
        createdAt TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_logs_task ON logs(taskId, id);
    `)
    ensureCompatColumns(db)
    migrateFromJson(db)
    migratePagespeedScoreToShots(db)
    migrateWpSitemapLabels(db)
    migrateDeliveryRuleSetDescription(db)
    removeDefaultPassBypass(db)
    migrateLogsFromFiles(db)
    // PSI API Key 配置已下线：清理历史遗留密钥
    db.prepare("DELETE FROM settings WHERE key = 'report.psiApiKey'").run()
  }
  return db
}

/**
 * 清理旧的「默认通过」参数：自动检测项应真实执行，合同文案应人工验收。
 * 该旁路已从引擎和界面移除，这里幂等删除历史参数，避免配置残留造成误解。
 */
function removeDefaultPassBypass(sqlite: DatabaseSync): void {
  const rows = sqlite
    .prepare("SELECT id, params FROM rules WHERE params LIKE '%defaultPass%'")
    .all() as SqlRow[]
  if (rows.length === 0) return

  const update = sqlite.prepare('UPDATE rules SET params = ? WHERE id = ?')
  sqlite.exec('BEGIN')
  try {
    for (const row of rows) {
      let params: Record<string, unknown> = {}
      try {
        params = JSON.parse(str(row.params) || '{}') as Record<string, unknown>
      } catch {
        continue
      }
      if (!('defaultPass' in params)) continue
      delete params.defaultPass
      update.run(JSON.stringify(params), num(row.id))
    }
    sqlite.exec('COMMIT')
  } catch (err) {
    sqlite.exec('ROLLBACK')
    console.warn('[store] 清理默认通过参数失败：', err)
  }
}

// ── 首次启动：把旧版 logs/*.log 文件导入数据库（幂等；原文件保留为备份）──

function migrateLogsFromFiles(sqlite: DatabaseSync): void {
  if (tableCount(sqlite, 'logs') > 0) return
  const dir = join(DATA_DIR, 'logs')
  if (!existsSync(dir)) return

  const files = readdirSync(dir).filter((name) => name.endsWith('.log'))
  if (files.length === 0) return

  const insert = sqlite.prepare('INSERT INTO logs (taskId, level, message, createdAt) VALUES (?, ?, ?, ?)')
  const linePattern = /^(\S+) \[([A-Z]+)\](?: \[task:(\d+)\])? (.*)$/
  // app.log 与 task-{id}.log 内容重叠，按「任务 + 时间 + 级别 + 内容」去重
  const seen = new Set<string>()
  sqlite.exec('BEGIN')
  try {
    for (const file of files) {
      const taskMatch = /^task-(\d+)\.log$/.exec(file)
      const fileTaskId = taskMatch ? Number(taskMatch[1]) : null
      for (const line of readFileSync(join(dir, file), 'utf8').split(/\r?\n/)) {
        if (!line.trim()) continue
        const match = linePattern.exec(line)
        if (!match) {
          const key = `${fileTaskId ?? ''}\u0000${line}`
          if (seen.has(key)) continue
          seen.add(key)
          insert.run(fileTaskId, 'info', line, now())
          continue
        }
        const [, ts, level, taskIdText, message] = match
        const taskId = taskIdText ? Number(taskIdText) : fileTaskId
        const key = `${taskId ?? ''}\u0000${ts}\u0000${level}\u0000${message}`
        if (seen.has(key)) continue
        seen.add(key)
        insert.run(taskId, level.toLowerCase(), message, ts)
      }
    }
    sqlite.exec('COMMIT')
  } catch (err) {
    sqlite.exec('ROLLBACK')
    console.warn('[store] 迁移日志文件失败：', err)
  }
}

export function now(): string {
  return new Date().toISOString()
}

export function num(value: unknown): number {
  return typeof value === 'number' ? value : Number(value ?? 0)
}

export function bool(value: unknown): boolean {
  return value === 1 || value === true
}

export function str(value: unknown): string {
  return value == null ? '' : String(value)
}

export function strOrNull(value: unknown): string | null {
  return value == null ? null : String(value)
}

// ── 首次启动：从旧 JSON 文件迁移（表为空才导入，幂等；JSON 保留为备份）──

function insertSql(table: string, columns: string[]): string {
  return `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`
}

function tableCount(sqlite: DatabaseSync, table: string): number {
  const row = sqlite.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as SqlRow
  return Number(row.c ?? 0)
}

function importJsonList(
  sqlite: DatabaseSync,
  table: string,
  file: string,
  columns: string[],
  map: (r: Record<string, unknown>) => unknown[]
): void {
  if (tableCount(sqlite, table) > 0) return
  const path = join(DATA_DIR, 'json', file)
  if (!existsSync(path)) return
  let rows: Record<string, unknown>[]
  try {
    rows = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>[]
  } catch {
    return
  }
  if (!Array.isArray(rows) || rows.length === 0) return
  const insert = sqlite.prepare(insertSql(table, columns))
  sqlite.exec('BEGIN')
  try {
    for (const r of rows) insert.run(...map(r))
    sqlite.exec('COMMIT')
  } catch (err) {
    sqlite.exec('ROLLBACK')
    console.warn(`[store] 迁移 ${file} 失败：`, err)
  }
}

/** 兼容旧库：幂等补齐 deliverable 列（已存在则跳过） */
function ensureCompatColumns(sqlite: DatabaseSync): void {
  const cols = (t: string): string[] => {
    try {
      const rows = sqlite.prepare(`PRAGMA table_info(${t})`).all() as SqlRow[]
      return rows.map((r) => str(r.name))
    } catch {
      return []
    }
  }
  if (!cols('rules').includes('deliverable')) {
    sqlite.exec('ALTER TABLE rules ADD COLUMN deliverable TEXT')
  }
  if (!cols('check_results').includes('deliverable')) {
    sqlite.exec("ALTER TABLE check_results ADD COLUMN deliverable TEXT NOT NULL DEFAULT ''")
  }
  if (!cols('rules').includes('scope')) {
    sqlite.exec("ALTER TABLE rules ADD COLUMN scope TEXT NOT NULL DEFAULT 'page'")
  }
  const addRuleKind = !cols('rules').includes('kind')
  if (addRuleKind) {
    sqlite.exec("ALTER TABLE rules ADD COLUMN kind TEXT NOT NULL DEFAULT 'check'")
  }
  // 新增：规则集多页面开关 / 结果按页面分组（幂等）
  if (!cols('rule_sets').includes('scanPages')) {
    sqlite.exec('ALTER TABLE rule_sets ADD COLUMN scanPages INTEGER NOT NULL DEFAULT 0')
  }
  if (!cols('check_results').includes('pageUrl')) {
    sqlite.exec("ALTER TABLE check_results ADD COLUMN pageUrl TEXT NOT NULL DEFAULT ''")
  }
  const addResultKind = !cols('check_results').includes('kind')
  if (addResultKind) {
    sqlite.exec("ALTER TABLE check_results ADD COLUMN kind TEXT NOT NULL DEFAULT 'check'")
  }
  // 仅在首次补列时按旧数据分类；之后一律以 kind 字段为准，避免覆盖用户手动修改。
  if (addResultKind) {
    sqlite.prepare("UPDATE check_results SET kind = 'deliverable' WHERE status = 'verify'").run()
    sqlite.prepare("UPDATE check_results SET kind = 'artifact' WHERE ruleKey LIKE 'artifact.%'").run()
  }
  if (!cols('tasks').includes('pageSetJson')) {
    sqlite.exec('ALTER TABLE tasks ADD COLUMN pageSetJson TEXT')
  }
  if (!cols('tasks').includes('siteDataJson')) {
    sqlite.exec('ALTER TABLE tasks ADD COLUMN siteDataJson TEXT')
  }
  // 仅在首次补列时导入旧分类；verify.* 是合同文案，不是自动检测项。
  if (addRuleKind) {
    sqlite.prepare("UPDATE rules SET kind = 'deliverable' WHERE ruleKey LIKE 'verify.%'").run()
  }
  // 旧库补预设：规则行无 deliverable 时用预设文案回填
  const preset = sqlite.prepare("SELECT ruleKey FROM rules WHERE deliverable IS NULL OR trim(deliverable) = ''").all() as SqlRow[]
  if (preset.length > 0) {
    const upd = sqlite.prepare('UPDATE rules SET deliverable = ? WHERE ruleKey = ?')
    sqlite.exec('BEGIN')
    try {
      for (const r of preset) {
        const text = DELIVERABLE_PRESETS[str(r.ruleKey)]
        if (text) upd.run(text, str(r.ruleKey))
      }
      sqlite.exec('COMMIT')
    } catch (err) {
      sqlite.exec('ROLLBACK')
      throw err
    }
  }
}

/**
 * PageSpeed 评分已下线：曾勾选评分的分组改为「PageSpeed 得分截图」，
 * 随后删除评分规则。用 settings 标记保证只执行一次。
 */
function migratePagespeedScoreToShots(sqlite: DatabaseSync): void {
  const marker = 'migration.pagespeedShots.v2'
  const done = sqlite.prepare('SELECT value FROM settings WHERE key = ?').get(marker) as SqlRow | undefined
  if (done) return
  const alreadyMigrated = sqlite
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get('migration.artifactRules.v1') as SqlRow | undefined

  const targets = alreadyMigrated
    ? []
    : (sqlite
        .prepare(
          `SELECT r.ruleSetId, r.groupName
           FROM rules r
           WHERE r.ruleKey = 'perf.pagespeed.score'
             AND NOT EXISTS (
               SELECT 1 FROM rules a WHERE a.ruleSetId = r.ruleSetId AND a.ruleKey = 'artifact.pagespeed.shots'
             )`
        )
        .all() as SqlRow[])

  const insert = sqlite.prepare(
    `INSERT INTO rules (ruleSetId, groupName, ruleKey, name, enabled, description, deliverable, scope, kind, params, sortOrder)
     VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`
  )
  const nextSort = sqlite.prepare('SELECT COALESCE(MAX(sortOrder), 0) + 1 AS n FROM rules WHERE ruleSetId = ?')
  const markerInsert = sqlite.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, '1')")
  sqlite.exec('BEGIN')
  for (const t of targets) {
    const ruleSetId = num(t.ruleSetId)
    insert.run(
      ruleSetId,
      str(t.groupName),
      'artifact.pagespeed.shots',
      'PageSpeed 得分截图（移动端/桌面端）',
      '保存 pagespeed.web.dev 得分报告截图，作为报告中的性能证据；仅生成截图，不改变规则通过状态',
      DELIVERABLE_PRESETS['artifact.pagespeed.shots'],
      'site',
      'artifact',
      '{}',
      num((nextSort.get(ruleSetId) as SqlRow).n)
    )
  }
  sqlite.prepare("DELETE FROM rules WHERE ruleKey = 'perf.pagespeed.score'").run()
  markerInsert.run(marker)
  sqlite.exec('COMMIT')
}

/**
 * Sitemap 规则已改为统一读取 wp-sitemap.xml，并只统计页面/新闻/产品。
 * 仅在规则名/交付文案仍是旧内置默认值时更新，避免覆盖用户自定义。
 */
function migrateWpSitemapLabels(sqlite: DatabaseSync): void {
  const marker = 'migration.wpSitemapLabels.v1'
  const done = sqlite.prepare('SELECT value FROM settings WHERE key = ?').get(marker) as SqlRow | undefined
  if (done) return
  const updName = sqlite.prepare('UPDATE rules SET name = ? WHERE ruleKey = ? AND name = ?')
  const updDeliverable = sqlite.prepare('UPDATE rules SET deliverable = ? WHERE ruleKey = ? AND deliverable = ?')
  sqlite.exec('BEGIN')
  try {
    updName.run('SEO：wp-sitemap.xml 可访问', 'seo.sitemap.xml', 'SEO：sitemap.xml 可访问')
    updDeliverable.run('站点地图可正常访问（含页面/新闻/产品）', 'seo.sitemap.xml', 'sitemap.xml 可正常访问')
    updName.run('Sitemap 检查（wp-sitemap.xml 可访问/有效）', 'delivery.sitemap', 'Sitemap 检查（robots 声明/可访问/有效）')
    updDeliverable.run(
      '已配置站点地图（wp-sitemap.xml 可访问，含页面/新闻/产品）',
      'delivery.sitemap',
      '已配置并提交站点地图（robots.txt 声明 Sitemap 且可访问、非空）'
    )
    sqlite.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, '1')").run(marker)
    sqlite.exec('COMMIT')
  } catch (err) {
    sqlite.exec('ROLLBACK')
    throw err
  }
}


/**
 * 同步交付规则集的说明文案：H1 / 隐藏板块已改为按 wp-sitemap.xml 内容链接逐页检查。
 * 仅当说明仍是旧内置默认值时更新，避免覆盖用户自定义文案。
 */
function migrateDeliveryRuleSetDescription(sqlite: DatabaseSync): void {
  const marker = 'migration.deliveryRuleSetDescription.v2'
  const done = sqlite.prepare('SELECT value FROM settings WHERE key = ?').get(marker) as SqlRow | undefined
  if (done) return
  const oldText =
    '网站交付前的质量检查：验证代表页面 H1 标题存在且唯一，扫描 Elementor 板块是否残留同时隐藏于桌面与移动端的元素；默认按 sitemap 枚举整站页面并按模板去重（新闻/产品等模板页只测代表页）。'
  const newText =
    '网站交付前的质量检查：验证 H1 标题存在且唯一，扫描 Elementor 板块是否残留同时隐藏于桌面与移动端的元素；H1 与隐藏板块按 wp-sitemap.xml 的页面/新闻/产品链接逐页检查，其他页面级规则按模板去重取代表页。'
  sqlite.exec('BEGIN')
  try {
    sqlite
      .prepare('UPDATE rule_sets SET description = ? WHERE name = ? AND description = ?')
      .run(newText, '网站交付检查', oldText)
    sqlite.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, '1')").run(marker)
    sqlite.exec('COMMIT')
  } catch (err) {
    sqlite.exec('ROLLBACK')
    throw err
  }
}

function migrateFromJson(sqlite: DatabaseSync): void {
  importJsonList(sqlite, 'sites', 'sites.json', ['id', 'name', 'url', 'remark', 'createdAt', 'updatedAt'], (r) => [
    num(r.id), str(r.name), str(r.url), str(r.remark), str(r.createdAt), str(r.updatedAt)
  ])
  importJsonList(sqlite, 'rule_sets', 'rulesets.json', ['id', 'name', 'description', 'isBuiltin', 'parentId', 'createdAt', 'updatedAt'], (r) => [
    num(r.id), str(r.name), str(r.description), r.isBuiltin ? 1 : 0, r.parentId == null ? null : num(r.parentId), str(r.createdAt), str(r.updatedAt)
  ])
  importJsonList(sqlite, 'rules', 'rules.json', ['id', 'ruleSetId', 'groupName', 'ruleKey', 'name', 'enabled', 'description', 'deliverable', 'scope', 'kind', 'params', 'sortOrder'], (r) => [
    num(r.id), num(r.ruleSetId), str(r.groupName), str(r.ruleKey), str(r.name), r.enabled === false ? 0 : 1,
    r.description == null ? null : str(r.description), strOrNull(r.deliverable), strOrNull(r.scope) || 'page',
    strOrNull(r.kind) || (str(r.ruleKey).startsWith('verify.') ? 'deliverable' : str(r.ruleKey).startsWith('artifact.') ? 'artifact' : 'check'),
    JSON.stringify(r.params ?? {}), num(r.sortOrder)
  ])
  importJsonList(sqlite, 'tasks', 'tasks.json', ['id', 'siteId', 'ruleSetId', 'status', 'score', 'passCount', 'warnCount', 'failCount', 'skipCount', 'verifyCount', 'startedAt', 'finishedAt', 'pagespeedJson', 'pageSetJson', 'siteDataJson', 'error'], (r) => [
    num(r.id), num(r.siteId), num(r.ruleSetId), str(r.status), r.score == null ? null : num(r.score),
    num(r.passCount), num(r.warnCount), num(r.failCount), num(r.skipCount), num(r.verifyCount),
    r.startedAt == null ? null : str(r.startedAt), r.finishedAt == null ? null : str(r.finishedAt),
    r.pagespeedJson == null ? null : str(r.pagespeedJson),
    r.pageSetJson == null ? null : str(r.pageSetJson), r.siteDataJson == null ? null : str(r.siteDataJson),
    r.error == null ? null : str(r.error)
  ])
  importJsonList(sqlite, 'check_results', 'results.json', ['id', 'taskId', 'ruleId', 'ruleKey', 'ruleName', 'groupName', 'kind', 'status', 'actualValue', 'expectedValue', 'description', 'deliverable', 'screenshotPath', 'note', 'checkedAt'], (r) => [
    num(r.id), num(r.taskId), r.ruleId == null ? null : num(r.ruleId), str(r.ruleKey), str(r.ruleName), str(r.groupName),
    strOrNull(r.kind) || (str(r.status) === 'verify' ? 'deliverable' : str(r.ruleKey).startsWith('artifact.') ? 'artifact' : 'check'),
    str(r.status), str(r.actualValue), str(r.expectedValue), str(r.description), strOrNull(r.deliverable),
    r.screenshotPath == null ? null : str(r.screenshotPath), str(r.note), str(r.checkedAt)
  ])
  // settings.json 是 kv 对象而非数组，单独处理
  if (tableCount(sqlite, 'settings') === 0) {
    const path = join(DATA_DIR, 'json', 'settings.json')
    if (existsSync(path)) {
      try {
        const data = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
        if (data && typeof data === 'object') {
          const insert = sqlite.prepare('INSERT INTO settings (key, value) VALUES (?, ?)')
          sqlite.exec('BEGIN')
          try {
            for (const [k, v] of Object.entries(data)) insert.run(k, str(v))
            sqlite.exec('COMMIT')
          } catch (err) {
            sqlite.exec('ROLLBACK')
            console.warn('[store] 迁移 settings.json 失败：', err)
          }
        }
      } catch {
        // 忽略损坏的 settings.json
      }
    }
  }
}
