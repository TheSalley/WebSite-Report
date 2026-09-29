import { mkdirSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { DatabaseSync } from 'node:sqlite'
import { DELIVERABLE_PRESETS } from './seed'

/** 数据文件存储根目录（本地 web-report-data） */
export const DATA_DIR = process.env.WEBREPORT_DATA_DIR ?? join(process.cwd(), 'web-report-data')

/** SQLite 数据库文件（首次启动自动从旧 JSON 迁移） */
const DB_FILE = join(DATA_DIR, 'realsite.db')

export interface SiteRow {
  id: number
  name: string
  url: string
  remark: string
  createdAt: string
  updatedAt: string
}

export interface RuleRow {
  id: number
  ruleSetId: number
  groupName: string
  ruleKey: string
  name: string
  enabled: boolean
  description?: string
  /** 交付成果文案（报告「交付成果」列展示，留空显示状态徽章） */
  deliverable?: string
  params: Record<string, unknown>
  sortOrder: number
}

export interface RuleSetRow {
  id: number
  name: string
  description: string
  isBuiltin: boolean
  parentId: number | null
  createdAt: string
  updatedAt: string
}

export interface TaskRow {
  id: number
  siteId: number
  ruleSetId: number
  status: 'pending' | 'running' | 'success' | 'failed' | 'stopped'
  score: number | null
  passCount: number
  warnCount: number
  failCount: number
  skipCount: number
  verifyCount: number
  startedAt: string | null
  finishedAt: string | null
  pagespeedJson: string | null
  error: string | null
}

export interface CheckResultRow {
  id: number
  taskId: number
  ruleId: number | null
  ruleKey: string
  ruleName: string
  groupName: string
  status: 'pass' | 'warn' | 'fail' | 'skip' | 'verify'
  actualValue: string
  expectedValue: string
  description: string
  /** 交付成果文案（来自规则的预设/自定义） */
  deliverable?: string
  screenshotPath: string | null
  note: string
  checkedAt: string
}

/** SQLite 查询返回的行类型（列名 -> 值） */
type SqlRow = Record<string, unknown>

let db: DatabaseSync | null = null

function getDb(): DatabaseSync {
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
        error TEXT
      );
      CREATE TABLE IF NOT EXISTS check_results (
        id INTEGER PRIMARY KEY,
        taskId INTEGER NOT NULL,
        ruleId INTEGER,
        ruleKey TEXT NOT NULL,
        ruleName TEXT NOT NULL,
        groupName TEXT NOT NULL,
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
    ensureDeliverableColumns(db)
    migrateFromJson(db)
  }
  return db
}

function now(): string {
  return new Date().toISOString()
}

function normalizeUrl(url: string): string {
  const trimmed = url.trim()
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

function num(value: unknown): number {
  return typeof value === 'number' ? value : Number(value ?? 0)
}

function bool(value: unknown): boolean {
  return value === 1 || value === true
}

function str(value: unknown): string {
  return value == null ? '' : String(value)
}

function strOrNull(value: unknown): string | null {
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
function ensureDeliverableColumns(sqlite: DatabaseSync): void {
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
  importJsonList(sqlite, 'rules', 'rules.json', ['id', 'ruleSetId', 'groupName', 'ruleKey', 'name', 'enabled', 'description', 'deliverable', 'params', 'sortOrder'], (r) => [
    num(r.id), num(r.ruleSetId), str(r.groupName), str(r.ruleKey), str(r.name), r.enabled === false ? 0 : 1,
    r.description == null ? null : str(r.description), strOrNull((r as any).deliverable), JSON.stringify(r.params ?? {}), num(r.sortOrder)
  ])
  importJsonList(sqlite, 'tasks', 'tasks.json', ['id', 'siteId', 'ruleSetId', 'status', 'score', 'passCount', 'warnCount', 'failCount', 'skipCount', 'verifyCount', 'startedAt', 'finishedAt', 'pagespeedJson', 'error'], (r) => [
    num(r.id), num(r.siteId), num(r.ruleSetId), str(r.status), r.score == null ? null : num(r.score),
    num(r.passCount), num(r.warnCount), num(r.failCount), num(r.skipCount), num(r.verifyCount),
    r.startedAt == null ? null : str(r.startedAt), r.finishedAt == null ? null : str(r.finishedAt),
    r.pagespeedJson == null ? null : str(r.pagespeedJson), r.error == null ? null : str(r.error)
  ])
  importJsonList(sqlite, 'check_results', 'results.json', ['id', 'taskId', 'ruleId', 'ruleKey', 'ruleName', 'groupName', 'status', 'actualValue', 'expectedValue', 'description', 'deliverable', 'screenshotPath', 'note', 'checkedAt'], (r) => [
    num(r.id), num(r.taskId), r.ruleId == null ? null : num(r.ruleId), str(r.ruleKey), str(r.ruleName), str(r.groupName),
    str(r.status), str(r.actualValue), str(r.expectedValue), str(r.description), strOrNull((r as any).deliverable),
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

// ── 站点 ──

export async function listSites(): Promise<SiteRow[]> {
  return getDb().prepare('SELECT * FROM sites ORDER BY id').all() as unknown as SiteRow[]
}

export async function getSite(id: number): Promise<SiteRow | null> {
  const row = getDb().prepare('SELECT * FROM sites WHERE id = ?').get(id) as SqlRow | undefined
  return row ? (row as unknown as SiteRow) : null
}

export async function createSite(input: { name: string; url: string; remark?: string }): Promise<SiteRow> {
  const ts = now()
  const result = getDb()
    .prepare('INSERT INTO sites (name, url, remark, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)')
    .run(input.name.trim(), normalizeUrl(input.url), input.remark ?? '', ts, ts)
  const created = await getSite(Number(result.lastInsertRowid))
  return created as SiteRow
}

export async function updateSite(id: number, input: { name?: string; url?: string; remark?: string }): Promise<SiteRow | null> {
  const current = await getSite(id)
  if (!current) return null
  const url = input.url ? normalizeUrl(input.url) : current.url
  getDb()
    .prepare('UPDATE sites SET name = ?, url = ?, remark = ?, updatedAt = ? WHERE id = ?')
    .run(input.name?.trim() ?? current.name, url, input.remark ?? current.remark, now(), id)
  return getSite(id)
}

export async function deleteSite(id: number): Promise<void> {
  getDb().prepare('DELETE FROM sites WHERE id = ?').run(id)
}

export async function deleteSites(ids: number[]): Promise<void> {
  const sqlite = getDb()
  const del = sqlite.prepare('DELETE FROM sites WHERE id = ?')
  sqlite.exec('BEGIN')
  try {
    for (const id of ids) del.run(id)
    sqlite.exec('COMMIT')
  } catch (err) {
    sqlite.exec('ROLLBACK')
    throw err
  }
}

/** 批量导入：每行一个 URL，名称取主机名；跳过已存在 */
export async function importSites(urls: string[]): Promise<{ created: number; skipped: number }> {
  const existing = new Set((await listSites()).map((s) => s.url))
  let created = 0
  let skipped = 0
  const ts = now()
  const insert = getDb().prepare('INSERT INTO sites (name, url, remark, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)')
  for (const raw of urls) {
    const trimmed = raw.trim()
    if (!trimmed) continue
    const normalized = normalizeUrl(trimmed)
    try {
      new URL(normalized)
    } catch {
      skipped++
      continue
    }
    if (existing.has(normalized)) {
      skipped++
      continue
    }
    let host = normalized.replace(/^https?:\/\//i, '').split('/')[0]
    try {
      host = new URL(normalized).hostname
    } catch {
      // 保留简化名
    }
    insert.run(host, normalized, '', ts, ts)
    existing.add(normalized)
    created++
  }
  return { created, skipped }
}

// ── 规则集 ──

export async function listRuleSets(): Promise<(RuleSetRow & { ruleCount?: number })[]> {
  const rows = getDb()
    .prepare(
      `SELECT rs.*, (SELECT COUNT(*) FROM rules r WHERE r.ruleSetId = rs.id) AS ruleCount
       FROM rule_sets rs ORDER BY rs.isBuiltin DESC, rs.id`
    )
    .all() as SqlRow[]
  return rows.map((r) => {
    const out = r as unknown as RuleSetRow & { ruleCount: number }
    out.isBuiltin = bool(r.isBuiltin)
    out.ruleCount = num(r.ruleCount)
    return out
  })
}

export async function getRuleSet(id: number): Promise<RuleSetRow | null> {
  const row = getDb().prepare('SELECT * FROM rule_sets WHERE id = ?').get(id) as SqlRow | undefined
  if (!row) return null
  const out = row as unknown as RuleSetRow
  out.isBuiltin = bool(row.isBuiltin)
  return out
}

export async function createRuleSet(input: {
  name: string
  description?: string
  isBuiltin?: boolean
  parentId?: number | null
}): Promise<RuleSetRow> {
  const ts = now()
  const result = getDb()
    .prepare('INSERT INTO rule_sets (name, description, isBuiltin, parentId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)')
    .run(input.name.trim(), input.description ?? '', input.isBuiltin ? 1 : 0, input.parentId ?? null, ts, ts)
  const created = await getRuleSet(Number(result.lastInsertRowid))
  return created as RuleSetRow
}

export async function updateRuleSet(id: number, input: { name?: string; description?: string }): Promise<RuleSetRow | null> {
  const current = await getRuleSet(id)
  if (!current) return null
  getDb()
    .prepare('UPDATE rule_sets SET name = ?, description = ?, updatedAt = ? WHERE id = ?')
    .run(input.name?.trim() ?? current.name, input.description ?? current.description, now(), id)
  return getRuleSet(id)
}

export async function deleteRuleSet(id: number): Promise<void> {
  const sqlite = getDb()
  sqlite.exec('BEGIN')
  try {
    sqlite.prepare('DELETE FROM rules WHERE ruleSetId = ?').run(id)
    sqlite.prepare('DELETE FROM rule_sets WHERE id = ?').run(id)
    sqlite.exec('COMMIT')
  } catch (err) {
    sqlite.exec('ROLLBACK')
    throw err
  }
}

export async function duplicateRuleSet(id: number, newName: string): Promise<RuleSetRow | null> {
  const source = await getRuleSet(id)
  if (!source) return null
  const sqlite = getDb()
  const ts = now()
  sqlite.exec('BEGIN')
  try {
    const inserted = sqlite
      .prepare('INSERT INTO rule_sets (name, description, isBuiltin, parentId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)')
      .run(newName, source.description, source.isBuiltin ? 1 : 0, source.parentId, ts, ts)
    const newId = Number(inserted.lastInsertRowid)
    const srcRules = sqlite.prepare('SELECT * FROM rules WHERE ruleSetId = ? ORDER BY id').all(id) as SqlRow[]
    const max = sqlite.prepare('SELECT MAX(id) AS m FROM rules').get() as SqlRow
    let nextId = Number(max.m ?? 0)
    const insert = sqlite.prepare(
      'INSERT INTO rules (id, ruleSetId, groupName, ruleKey, name, enabled, description, deliverable, params, sortOrder) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    for (const r of srcRules) {
      insert.run(++nextId, newId, str(r.groupName), str(r.ruleKey), str(r.name), bool(r.enabled) ? 1 : 0, strOrNull(r.description), strOrNull(r.deliverable), str(r.params), num(r.sortOrder))
    }
    sqlite.exec('COMMIT')
    return getRuleSet(newId)
  } catch (err) {
    sqlite.exec('ROLLBACK')
    throw err
  }
}

// ── 规则 ──

export async function listRules(): Promise<RuleRow[]> {
  const rows = getDb().prepare('SELECT * FROM rules ORDER BY id').all() as SqlRow[]
  return rows.map((r) => ({
    id: num(r.id),
    ruleSetId: num(r.ruleSetId),
    groupName: str(r.groupName),
    ruleKey: str(r.ruleKey),
    name: str(r.name),
    enabled: bool(r.enabled),
    description: strOrNull(r.description) ?? undefined,
    deliverable: strOrNull(r.deliverable) ?? undefined,
    params: JSON.parse(str(r.params) || '{}') as Record<string, unknown>,
    sortOrder: num(r.sortOrder)
  }))
}

export async function listRulesForSet(ruleSetId: number): Promise<RuleRow[]> {
  const rows = getDb()
    .prepare('SELECT * FROM rules WHERE ruleSetId = ? ORDER BY sortOrder, id')
    .all(ruleSetId) as SqlRow[]
  return rows.map((r) => ({
    id: num(r.id),
    ruleSetId: num(r.ruleSetId),
    groupName: str(r.groupName),
    ruleKey: str(r.ruleKey),
    name: str(r.name),
    enabled: bool(r.enabled),
    description: strOrNull(r.description) ?? undefined,
    deliverable: strOrNull(r.deliverable) ?? undefined,
    params: JSON.parse(str(r.params) || '{}') as Record<string, unknown>,
    sortOrder: num(r.sortOrder)
  }))
}

export async function replaceRules(
  ruleSetId: number,
  rules: (Omit<RuleRow, 'id'> & { id?: number })[]
): Promise<RuleRow[]> {
  const sqlite = getDb()
  const max = sqlite.prepare('SELECT MAX(id) AS m FROM rules').get() as SqlRow
  let maxId = Number(max.m ?? 0)
  const assigned: RuleRow[] = rules.map((r, idx) => {
    const preset = DELIVERABLE_PRESETS[r.ruleKey]
    return {
      ...r,
      id: r.id ?? maxId + 1 + idx,
      ruleSetId,
      deliverable: r.deliverable && r.deliverable.trim() ? r.deliverable : preset ?? ''
    }
  })
  maxId = Math.max(maxId, ...assigned.map((r) => r.id))
  sqlite.exec('BEGIN')
  try {
    sqlite.prepare('DELETE FROM rules WHERE ruleSetId = ?').run(ruleSetId)
    const insert = sqlite.prepare(
      'INSERT INTO rules (id, ruleSetId, groupName, ruleKey, name, enabled, description, deliverable, params, sortOrder) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    for (const r of assigned) {
      insert.run(r.id, r.ruleSetId, r.groupName, r.ruleKey, r.name, r.enabled ? 1 : 0, r.description ?? null, r.deliverable ?? null, JSON.stringify(r.params ?? {}), r.sortOrder)
    }
    sqlite.exec('COMMIT')
  } catch (err) {
    sqlite.exec('ROLLBACK')
    throw err
  }
  return assigned
}

// ── 任务 ──

export async function listTasksRaw(limit = 100): Promise<TaskRow[]> {
  return getDb()
    .prepare('SELECT * FROM tasks ORDER BY id DESC LIMIT ?')
    .all(limit) as unknown as TaskRow[]
}

export async function getTask(id: number): Promise<TaskRow | null> {
  const row = getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(id) as SqlRow | undefined
  return row ? (row as unknown as TaskRow) : null
}

export async function createTask(input: { siteId: number; ruleSetId: number }): Promise<TaskRow> {
  const result = getDb()
    .prepare(
      `INSERT INTO tasks (siteId, ruleSetId, status, score, passCount, warnCount, failCount, skipCount, verifyCount, startedAt, finishedAt, pagespeedJson, error)
       VALUES (?, ?, 'pending', NULL, 0, 0, 0, 0, 0, NULL, NULL, NULL, NULL)`
    )
    .run(input.siteId, input.ruleSetId)
  const created = await getTask(Number(result.lastInsertRowid))
  return created as TaskRow
}

const TASK_COLUMNS = new Set([
  'status', 'score', 'passCount', 'warnCount', 'failCount', 'skipCount', 'verifyCount',
  'startedAt', 'finishedAt', 'pagespeedJson', 'error'
])

export async function updateTask(id: number, patch: Partial<TaskRow>): Promise<TaskRow | null> {
  const entries = Object.entries(patch).filter(([k]) => TASK_COLUMNS.has(k))
  if (entries.length === 0) return getTask(id)
  const sets = entries.map(([k]) => `${k} = ?`).join(', ')
  getDb()
    .prepare(`UPDATE tasks SET ${sets} WHERE id = ?`)
    .run(...entries.map(([, v]) => v as string | number | null), id)
  return getTask(id)
}

export async function deleteTask(id: number): Promise<void> {
  const sqlite = getDb()
  sqlite.exec('BEGIN')
  try {
    sqlite.prepare('DELETE FROM check_results WHERE taskId = ?').run(id)
    sqlite.prepare('DELETE FROM tasks WHERE id = ?').run(id)
    sqlite.exec('COMMIT')
  } catch (err) {
    sqlite.exec('ROLLBACK')
    throw err
  }
}

// ── 检测结果 ──

export async function listCheckResults(taskId: number): Promise<CheckResultRow[]> {
  return getDb()
    .prepare('SELECT * FROM check_results WHERE taskId = ? ORDER BY id')
    .all(taskId) as unknown as CheckResultRow[]
}

export async function saveCheckResults(taskId: number, results: Omit<CheckResultRow, 'id'>[]): Promise<void> {
  const sqlite = getDb()
  sqlite.exec('BEGIN')
  try {
    sqlite.prepare('DELETE FROM check_results WHERE taskId = ?').run(taskId)
    const insert = sqlite.prepare(
      `INSERT INTO check_results (taskId, ruleId, ruleKey, ruleName, groupName, status, actualValue, expectedValue, description, deliverable, screenshotPath, note, checkedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    for (const r of results) {
      insert.run(taskId, r.ruleId, r.ruleKey, r.ruleName, r.groupName, r.status, r.actualValue, r.expectedValue, r.description, r.deliverable ?? null, r.screenshotPath, r.note, r.checkedAt)
    }
    sqlite.exec('COMMIT')
  } catch (err) {
    sqlite.exec('ROLLBACK')
    throw err
  }
}

export async function updateCheckResultNote(id: number, note: string): Promise<void> {
  getDb().prepare('UPDATE check_results SET note = ? WHERE id = ?').run(note, id)
}

/** 更新单条结果状态（人工验收确认），返回更新后的行 */
export async function updateCheckResultStatus(id: number, status: CheckResultRow['status']): Promise<CheckResultRow | null> {
  getDb().prepare('UPDATE check_results SET status = ? WHERE id = ?').run(status, id)
  const row = getDb().prepare('SELECT * FROM check_results WHERE id = ?').get(id) as SqlRow | undefined
  return row ? (row as unknown as CheckResultRow) : null
}

// ── 设置 ──

export async function getSettings(): Promise<Record<string, string>> {
  const rows = getDb().prepare('SELECT key, value FROM settings').all() as SqlRow[]
  const out: Record<string, string> = {}
  for (const r of rows) out[str(r.key)] = str(r.value)
  return out
}

export async function saveSettings(settings: Record<string, string>): Promise<void> {
  const sqlite = getDb()
  const upsert = sqlite.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  )
  sqlite.exec('BEGIN')
  try {
    for (const [k, v] of Object.entries(settings)) upsert.run(k, v)
    sqlite.exec('COMMIT')
  } catch (err) {
    sqlite.exec('ROLLBACK')
    throw err
  }
}