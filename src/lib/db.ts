import { mkdirSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { DatabaseSync } from 'node:sqlite'
import { DELIVERABLE_PRESETS } from './seed'

/** 数据文件存储根目录（本地 web-report-data） */
export const DATA_DIR = process.env.WEBREPORT_DATA_DIR ?? join(process.cwd(), 'web-report-data')

/** SQLite 数据库文件（首次启动自动从旧 JSON 迁移） */
const DB_FILE = join(DATA_DIR, 'realsite.db')

/** SQLite 查询返回的行类型（列名 -> 值） */
export type SqlRow = Record<string, unknown>

let db: DatabaseSync | null = null

export function getDb(): DatabaseSync {
  if (!db) {
    mkdirSync(DATA_DIR, { recursive: true })
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
    `)
    ensureCompatColumns(db)
    migrateFromJson(db)
  }
  return db
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
  // 新增：规则集多页面开关 / 结果按页面分组（幂等）
  if (!cols('rule_sets').includes('scanPages')) {
    sqlite.exec('ALTER TABLE rule_sets ADD COLUMN scanPages INTEGER NOT NULL DEFAULT 0')
  }
  if (!cols('check_results').includes('pageUrl')) {
    sqlite.exec("ALTER TABLE check_results ADD COLUMN pageUrl TEXT NOT NULL DEFAULT ''")
  }
  if (!cols('tasks').includes('pageSetJson')) {
    sqlite.exec('ALTER TABLE tasks ADD COLUMN pageSetJson TEXT')
  }
  if (!cols('tasks').includes('siteDataJson')) {
    sqlite.exec('ALTER TABLE tasks ADD COLUMN siteDataJson TEXT')
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


function migrateFromJson(sqlite: DatabaseSync): void {
  importJsonList(sqlite, 'sites', 'sites.json', ['id', 'name', 'url', 'remark', 'createdAt', 'updatedAt'], (r) => [
    num(r.id), str(r.name), str(r.url), str(r.remark), str(r.createdAt), str(r.updatedAt)
  ])
  importJsonList(sqlite, 'rule_sets', 'rulesets.json', ['id', 'name', 'description', 'isBuiltin', 'parentId', 'createdAt', 'updatedAt'], (r) => [
    num(r.id), str(r.name), str(r.description), r.isBuiltin ? 1 : 0, r.parentId == null ? null : num(r.parentId), str(r.createdAt), str(r.updatedAt)
  ])
  importJsonList(sqlite, 'rules', 'rules.json', ['id', 'ruleSetId', 'groupName', 'ruleKey', 'name', 'enabled', 'description', 'deliverable', 'scope', 'params', 'sortOrder'], (r) => [
    num(r.id), num(r.ruleSetId), str(r.groupName), str(r.ruleKey), str(r.name), r.enabled === false ? 0 : 1,
    r.description == null ? null : str(r.description), strOrNull(r.deliverable), strOrNull(r.scope) || 'page',
    JSON.stringify(r.params ?? {}), num(r.sortOrder)
  ])
  importJsonList(sqlite, 'tasks', 'tasks.json', ['id', 'siteId', 'ruleSetId', 'status', 'score', 'passCount', 'warnCount', 'failCount', 'skipCount', 'verifyCount', 'startedAt', 'finishedAt', 'pagespeedJson', 'error'], (r) => [
    num(r.id), num(r.siteId), num(r.ruleSetId), str(r.status), r.score == null ? null : num(r.score),
    num(r.passCount), num(r.warnCount), num(r.failCount), num(r.skipCount), num(r.verifyCount),
    r.startedAt == null ? null : str(r.startedAt), r.finishedAt == null ? null : str(r.finishedAt),
    r.pagespeedJson == null ? null : str(r.pagespeedJson), r.error == null ? null : str(r.error)
  ])
  importJsonList(sqlite, 'check_results', 'results.json', ['id', 'taskId', 'ruleId', 'ruleKey', 'ruleName', 'groupName', 'status', 'actualValue', 'expectedValue', 'description', 'deliverable', 'screenshotPath', 'note', 'checkedAt'], (r) => [
    num(r.id), num(r.taskId), r.ruleId == null ? null : num(r.ruleId), str(r.ruleKey), str(r.ruleName), str(r.groupName),
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
