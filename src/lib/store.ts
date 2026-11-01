import { getDb, now, num, bool, str, strOrNull, type SqlRow } from './db'
import { DELIVERABLE_PRESETS } from './seed'
export { DATA_DIR } from './db'

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
  /** 执行范围：'site' 站点级（整站仅执行一次）| 'page' 页面级（每个代表页执行，默认） */
  scope?: 'page' | 'site'
  params: Record<string, unknown>
  sortOrder: number
}

export interface RuleSetRow {
  id: number
  name: string
  description: string
  isBuiltin: boolean
  parentId: number | null
  scanPages: boolean
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
  pageSetJson: string | null
  siteDataJson: string | null
  error: string | null
}

export interface CheckResultRow {
  id: number
  taskId: number
  ruleId: number | null
  ruleKey: string
  ruleName: string
  groupName: string
  pageUrl: string
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

function normalizeUrl(url: string): string {
  const trimmed = url.trim()
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
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
    out.scanPages = bool(r.scanPages)
    out.ruleCount = num(r.ruleCount)
    return out
  })
}

export async function getRuleSet(id: number): Promise<RuleSetRow | null> {
  const row = getDb().prepare('SELECT * FROM rule_sets WHERE id = ?').get(id) as SqlRow | undefined
  if (!row) return null
  const out = row as unknown as RuleSetRow
  out.isBuiltin = bool(row.isBuiltin)
  out.scanPages = bool(row.scanPages)
  return out
}

export async function createRuleSet(input: {
  name: string
  description?: string
  isBuiltin?: boolean
  parentId?: number | null
  scanPages?: boolean
}): Promise<RuleSetRow> {
  const ts = now()
  const result = getDb()
    .prepare('INSERT INTO rule_sets (name, description, isBuiltin, scanPages, parentId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(input.name.trim(), input.description ?? '', input.isBuiltin ? 1 : 0, input.scanPages ? 1 : 0, input.parentId ?? null, ts, ts)
  const created = await getRuleSet(Number(result.lastInsertRowid))
  return created as RuleSetRow
}

export async function updateRuleSet(id: number, input: { name?: string; description?: string; scanPages?: boolean }): Promise<RuleSetRow | null> {
  const current = await getRuleSet(id)
  if (!current) return null
  const scanPages = input.scanPages !== undefined ? (input.scanPages ? 1 : 0) : current.scanPages ? 1 : 0
  getDb()
    .prepare('UPDATE rule_sets SET name = ?, description = ?, scanPages = ?, updatedAt = ? WHERE id = ?')
    .run(input.name?.trim() ?? current.name, input.description ?? current.description, scanPages, now(), id)
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
      .prepare('INSERT INTO rule_sets (name, description, isBuiltin, scanPages, parentId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(newName, source.description, source.isBuiltin ? 1 : 0, source.scanPages ? 1 : 0, source.parentId, ts, ts)
    const newId = Number(inserted.lastInsertRowid)
    const srcRules = sqlite.prepare('SELECT * FROM rules WHERE ruleSetId = ? ORDER BY id').all(id) as SqlRow[]
    const max = sqlite.prepare('SELECT MAX(id) AS m FROM rules').get() as SqlRow
    let nextId = Number(max.m ?? 0)
    const insert = sqlite.prepare(
      'INSERT INTO rules (id, ruleSetId, groupName, ruleKey, name, enabled, description, deliverable, scope, params, sortOrder) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    for (const r of srcRules) {
      insert.run(++nextId, newId, str(r.groupName), str(r.ruleKey), str(r.name), bool(r.enabled) ? 1 : 0, strOrNull(r.description), strOrNull(r.deliverable), strOrNull(r.scope) || 'page', str(r.params), num(r.sortOrder))
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
    scope: (str(r.scope) || 'page') as 'page' | 'site',
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
    scope: (str(r.scope) || 'page') as 'page' | 'site',
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
      'INSERT INTO rules (id, ruleSetId, groupName, ruleKey, name, enabled, description, deliverable, scope, params, sortOrder) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    for (const r of assigned) {
      insert.run(r.id, r.ruleSetId, r.groupName, r.ruleKey, r.name, r.enabled ? 1 : 0, r.description ?? null, r.deliverable ?? null, r.scope ?? 'page', JSON.stringify(r.params ?? {}), r.sortOrder)
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

/** 分页查询任务（按 id 倒序） */
export async function listTasksPage(
  page: number,
  pageSize: number
): Promise<{ items: TaskRow[]; total: number }> {
  const sqlite = getDb()
  const total = (sqlite.prepare('SELECT COUNT(*) AS c FROM tasks').get() as SqlRow).c as number
  const items = sqlite
    .prepare('SELECT * FROM tasks ORDER BY id DESC LIMIT ? OFFSET ?')
    .all(pageSize, (page - 1) * pageSize) as unknown as TaskRow[]
  return { items, total }
}

/** 全局运行中任务数量（含历史遗留 running 状态） */
export async function countRunningTasks(): Promise<number> {
  const row = getDb().prepare("SELECT COUNT(*) AS c FROM tasks WHERE status = 'running'").get() as SqlRow
  return (row.c as number) ?? 0
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
  'startedAt', 'finishedAt', 'pagespeedJson', 'pageSetJson', 'siteDataJson', 'error'
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

/** 启动恢复：把遗留 running 但不在 activeIds（本进程正在运行）中的任务标记为「中断」（进程崩溃/重启后避免永远显示运行中） */
export async function recoverStaleRunningTasks(activeIds: number[]): Promise<number> {
  const sqlite = getDb()
  const ts = now()
  let res
  if (activeIds.length === 0) {
    res = sqlite
      .prepare("UPDATE tasks SET status='failed', error='服务重启导致任务中断', finishedAt=? WHERE status='running'")
      .run(ts)
  } else {
    const ph = activeIds.map(() => '?').join(',')
    res = sqlite
      .prepare(`UPDATE tasks SET status='failed', error='服务重启导致任务中断', finishedAt=? WHERE status='running' AND id NOT IN (${ph})`)
      .run(ts, ...activeIds)
  }
  return Number(res.changes)
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
      `INSERT INTO check_results (taskId, ruleId, ruleKey, ruleName, groupName, pageUrl, status, actualValue, expectedValue, description, deliverable, screenshotPath, note, checkedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    for (const r of results) {
      insert.run(taskId, r.ruleId, r.ruleKey, r.ruleName, r.groupName, r.pageUrl ?? '', r.status, r.actualValue, r.expectedValue, r.description, r.deliverable ?? null, r.screenshotPath, r.note, r.checkedAt)
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

/** 更新单条结果的交付成果文案（报告「交付成果」列） */
export async function updateCheckResultDeliverable(id: number, deliverable: string): Promise<void> {
  getDb().prepare('UPDATE check_results SET deliverable = ? WHERE id = ?').run(deliverable, id)
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
