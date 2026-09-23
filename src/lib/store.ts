import { mkdir, readFile, writeFile, rm } from 'fs/promises'
import { join } from 'path'

/** 数据文件存储根目录（本地 web-report-data） */
export const DATA_DIR = process.env.WEBREPORT_DATA_DIR ?? join(process.cwd(), 'web-report-data')

/** 全局写串行队列：保证读-改-写原子性（单进程本地存储） */
let opChain: Promise<unknown> = Promise.resolve()
export function serial<T>(op: () => Promise<T>): Promise<T> {
  const p = opChain.then(op, op)
  opChain = p.then(
    () => undefined,
    () => undefined
  )
  return p
}

/** 原子写 JSON：先写临时文件再改名，避免写一半被读到 */
async function writeJson(file: string, data: unknown): Promise<void> {
  await mkdir(join(DATA_DIR, 'json'), { recursive: true })
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  await writeFile(tmp, JSON.stringify(data, null, 2), 'utf8')
  try {
    await writeFile(file, JSON.stringify(data, null, 2), 'utf8')
  } finally {
    await rm(tmp, { force: true })
  }
}

/** 读取 JSON（不存在返回默认值） */
async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(file, 'utf8')
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

/** 下一个自增 id（基于现有数据的最大值 +1） */
function nextId<T extends { id: number }>(items: T[]): number {
  return items.reduce((max, i) => Math.max(max, i.id), 0) + 1
}

function now(): string {
  return new Date().toISOString()
}

const sitesFile = () => join(DATA_DIR, 'json', 'sites.json')
const ruleSetsFile = () => join(DATA_DIR, 'json', 'rulesets.json')
const rulesFile = () => join(DATA_DIR, 'json', 'rules.json')
const tasksFile = () => join(DATA_DIR, 'json', 'tasks.json')
const resultsFile = () => join(DATA_DIR, 'json', 'results.json')
const settingsFile = () => join(DATA_DIR, 'json', 'settings.json')

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
  severity: 'critical' | 'warning' | 'suggest'
  enabled: boolean
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
  severity: 'critical' | 'warning' | 'suggest'
  status: 'pass' | 'warn' | 'fail' | 'skip' | 'verify'
  actualValue: string
  expectedValue: string
  description: string
  screenshotPath: string | null
  note: string
  checkedAt: string
}

// ── 站点 ──

export async function listSites(): Promise<SiteRow[]> {
  return readJson<SiteRow[]>(sitesFile(), [])
}

export async function getSite(id: number): Promise<SiteRow | null> {
  const rows = await listSites()
  return rows.find((r) => r.id === id) ?? null
}

export async function createSite(input: { name: string; url: string; remark?: string }): Promise<SiteRow> {
  return serial(async () => {
    const rows = await listSites()
    const url = input.url.trim()
    const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`
    const row: SiteRow = {
      id: nextId(rows),
      name: input.name.trim(),
      url: normalized,
      remark: input.remark ?? '',
      createdAt: now(),
      updatedAt: now()
    }
    rows.push(row)
    await writeJson(sitesFile(), rows)
    return row
  })
}

export async function updateSite(id: number, input: { name?: string; url?: string; remark?: string }): Promise<SiteRow | null> {
  return serial(async () => {
    const rows = await listSites()
    const idx = rows.findIndex((r) => r.id === id)
    if (idx < 0) return null
    const current = rows[idx]
    let url = input.url?.trim() ?? current.url
    if (input.url) url = /^https?:\/\//i.test(url) ? url : `https://${url}`
    rows[idx] = {
      ...current,
      name: input.name?.trim() ?? current.name,
      url,
      remark: input.remark ?? current.remark,
      updatedAt: now()
    }
    await writeJson(sitesFile(), rows)
    return rows[idx]
  })
}

export async function deleteSite(id: number): Promise<void> {
  return serial(async () => {
    const rows = await listSites()
    await writeJson(sitesFile(), rows.filter((r) => r.id !== id))
  })
}

export async function deleteSites(ids: number[]): Promise<void> {
  return serial(async () => {
    const set = new Set(ids)
    const rows = await listSites()
    await writeJson(sitesFile(), rows.filter((r) => !set.has(r.id)))
  })
}

/** 批量导入：每行一个 URL，名称取主机名；跳过已存在 */
export async function importSites(urls: string[]): Promise<{ created: number; skipped: number }> {
  return serial(async () => {
    const rows = await listSites()
    const existing = new Set(rows.map((r) => r.url))
    let created = 0
    let skipped = 0
    for (const raw of urls) {
      const trimmed = raw.trim()
      if (!trimmed) continue
      const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
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
      rows.push({
        id: nextId(rows),
        name: host,
        url: normalized,
        remark: '',
        createdAt: now(),
        updatedAt: now()
      })
      existing.add(normalized)
      created++
    }
    await writeJson(sitesFile(), rows)
    return { created, skipped }
  })
}

// ── 规则集 ──

export async function listRuleSets(): Promise<RuleSetRow[]> {
  const rows = await readJson<RuleSetRow[]>(ruleSetsFile(), [])
  const rules = await listRules()
  return rows
    .slice()
    .sort((a, b) => Number(b.isBuiltin) - Number(a.isBuiltin) || a.id - b.id)
    .map((rs) => ({ ...rs, ruleCount: rules.filter((r) => r.ruleSetId === rs.id).length }))
}

export async function getRuleSet(id: number): Promise<RuleSetRow | null> {
  const rows = await readJson<RuleSetRow[]>(ruleSetsFile(), [])
  return rows.find((r) => r.id === id) ?? null
}

export async function createRuleSet(input: {
  name: string
  description?: string
  isBuiltin?: boolean
  parentId?: number | null
}): Promise<RuleSetRow> {
  return serial(async () => {
    const rows = await readJson<RuleSetRow[]>(ruleSetsFile(), [])
    const row: RuleSetRow = {
      id: nextId(rows),
      name: input.name.trim(),
      description: input.description ?? '',
      isBuiltin: input.isBuiltin ?? false,
      parentId: input.parentId ?? null,
      createdAt: now(),
      updatedAt: now()
    }
    rows.push(row)
    await writeJson(ruleSetsFile(), rows)
    return row
  })
}

export async function updateRuleSet(id: number, input: { name?: string; description?: string }): Promise<RuleSetRow | null> {
  return serial(async () => {
    const rows = await readJson<RuleSetRow[]>(ruleSetsFile(), [])
    const idx = rows.findIndex((r) => r.id === id)
    if (idx < 0) return null
    rows[idx] = {
      ...rows[idx],
      name: input.name?.trim() ?? rows[idx].name,
      description: input.description ?? rows[idx].description,
      updatedAt: now()
    }
    await writeJson(ruleSetsFile(), rows)
    return rows[idx]
  })
}

export async function deleteRuleSet(id: number): Promise<void> {
  return serial(async () => {
    const rows = await readJson<RuleSetRow[]>(ruleSetsFile(), [])
    await writeJson(ruleSetsFile(), rows.filter((r) => r.id !== id))
    const rules = await listRules()
    await writeJson(rulesFile(), rules.filter((r) => r.ruleSetId !== id))
  })
}

export async function duplicateRuleSet(id: number, newName: string): Promise<RuleSetRow | null> {
  return serial(async () => {
    const source = await getRuleSet(id)
    if (!source) return null
    const created = await createRuleSet({ name: newName, description: source.description })
    const rules = (await listRules()).filter((r) => r.ruleSetId === id)
    const all = await listRules()
    for (const r of rules) {
      all.push({ ...r, id: nextId(all), ruleSetId: created.id })
    }
    await writeJson(rulesFile(), all)
    return created
  })
}

// ── 规则 ──

export async function listRules(): Promise<RuleRow[]> {
  return readJson<RuleRow[]>(rulesFile(), [])
}

export async function listRulesForSet(ruleSetId: number): Promise<RuleRow[]> {
  const rows = await listRules()
  return rows
    .filter((r) => r.ruleSetId === ruleSetId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
}

export async function replaceRules(
  ruleSetId: number,
  rules: (Omit<RuleRow, 'id'> & { id?: number })[]
): Promise<RuleRow[]> {
  return serial(async () => {
    const all = await listRules()
    const rest = all.filter((r) => r.ruleSetId !== ruleSetId)
    let maxId = all.reduce((max, r) => Math.max(max, r.id), 0)
    const assigned: RuleRow[] = rules.map((r, idx) => ({
      ...r,
      id: r.id ?? maxId + 1 + idx,
      ruleSetId
    }))
    maxId = Math.max(maxId, ...assigned.map((r) => r.id))
    rest.push(...assigned)
    await writeJson(rulesFile(), rest)
    return assigned
  })
}

// ── 任务 ──

export async function listTasksRaw(limit = 100): Promise<TaskRow[]> {
  const rows = await readJson<TaskRow[]>(tasksFile(), [])
  return rows.sort((a, b) => b.id - a.id).slice(0, limit)
}

export async function getTask(id: number): Promise<TaskRow | null> {
  const rows = await readJson<TaskRow[]>(tasksFile(), [])
  return rows.find((r) => r.id === id) ?? null
}

export async function createTask(input: { siteId: number; ruleSetId: number }): Promise<TaskRow> {
  return serial(async () => {
    const rows = await readJson<TaskRow[]>(tasksFile(), [])
    const row: TaskRow = {
      id: nextId(rows),
      siteId: input.siteId,
      ruleSetId: input.ruleSetId,
      status: 'pending',
      score: null,
      passCount: 0,
      warnCount: 0,
      failCount: 0,
      skipCount: 0,
      verifyCount: 0,
      startedAt: null,
      finishedAt: null,
      pagespeedJson: null,
      error: null
    }
    rows.push(row)
    await writeJson(tasksFile(), rows)
    return row
  })
}

export async function updateTask(id: number, patch: Partial<TaskRow>): Promise<TaskRow | null> {
  return serial(async () => {
    const rows = await readJson<TaskRow[]>(tasksFile(), [])
    const idx = rows.findIndex((r) => r.id === id)
    if (idx < 0) return null
    rows[idx] = { ...rows[idx], ...patch }
    await writeJson(tasksFile(), rows)
    return rows[idx]
  })
}

export async function deleteTask(id: number): Promise<void> {
  return serial(async () => {
    const rows = await readJson<TaskRow[]>(tasksFile(), [])
    await writeJson(tasksFile(), rows.filter((r) => r.id !== id))
    const results = await listCheckResults(id)
    const all = await readJson<CheckResultRow[]>(resultsFile(), [])
    const resultIds = new Set(results.map((r) => r.id))
    await writeJson(resultsFile(), all.filter((r) => !resultIds.has(r.id)))
  })
}

// ── 检测结果 ──

export async function listCheckResults(taskId: number): Promise<CheckResultRow[]> {
  const rows = await readJson<CheckResultRow[]>(resultsFile(), [])
  return rows.filter((r) => r.taskId === taskId)
}

export async function saveCheckResults(taskId: number, results: Omit<CheckResultRow, 'id'>[]): Promise<void> {
  return serial(async () => {
    const all = await readJson<CheckResultRow[]>(resultsFile(), [])
    const rest = all.filter((r) => r.taskId !== taskId)
    let maxId = all.reduce((max, r) => Math.max(max, r.id), 0)
    rest.push(...results.map((r) => ({ ...r, id: ++maxId })))
    await writeJson(resultsFile(), rest)
  })
}

export async function updateCheckResultNote(id: number, note: string): Promise<void> {
  return serial(async () => {
    const all = await readJson<CheckResultRow[]>(resultsFile(), [])
    const idx = all.findIndex((r) => r.id === id)
    if (idx < 0) return
    all[idx] = { ...all[idx], note }
    await writeJson(resultsFile(), all)
  })
}

/** 更新单条结果状态（人工验收确认），返回更新后的行 */
export async function updateCheckResultStatus(id: number, status: CheckResultRow['status']): Promise<CheckResultRow | null> {
  return serial(async () => {
    const all = await readJson<CheckResultRow[]>(resultsFile(), [])
    const idx = all.findIndex((r) => r.id === id)
    if (idx < 0) return null
    all[idx] = { ...all[idx], status }
    await writeJson(resultsFile(), all)
    return all[idx]
  })
}

// ── 设置 ──

export async function getSettings(): Promise<Record<string, string>> {
  return readJson<Record<string, string>>(settingsFile(), {})
}

export async function saveSettings(settings: Record<string, string>): Promise<void> {
  return serial(async () => {
    await writeJson(settingsFile(), settings)
  })
}

