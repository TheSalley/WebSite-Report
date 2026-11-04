import { getDb, now, str, type SqlRow } from './db'

export type LogLevel = 'info' | 'warn' | 'error' | 'debug'

function formatLine(level: LogLevel, message: string, taskId: number | null, ts: string): string {
  const tag = taskId != null ? ` [task:${taskId}]` : ''
  return `${ts} [${level.toUpperCase()}]${tag} ${message}`
}

/** 写一条日志到数据库（不影响主流程） */
export function log(level: LogLevel, message: string, taskId?: number): void {
  try {
    getDb()
      .prepare('INSERT INTO logs (taskId, level, message, createdAt) VALUES (?, ?, ?, ?)')
      .run(taskId ?? null, level, message, now())
  } catch {
    // 日志写入失败不阻塞业务
  }
}

/** 读取任务日志（按行返回；无日志返回空数组） */
export function readTaskLog(taskId: number): string[] {
  try {
    const rows = getDb()
      .prepare('SELECT level, message, createdAt FROM logs WHERE taskId = ? ORDER BY id')
      .all(taskId) as SqlRow[]
    return rows.map((row) =>
      formatLine(str(row.level) as LogLevel, str(row.message), taskId, str(row.createdAt))
    )
  } catch {
    return []
  }
}

export const logInfo = (msg: string, taskId?: number) => log('info', msg, taskId)
export const logWarn = (msg: string, taskId?: number) => log('warn', msg, taskId)
export const logError = (msg: string, err?: unknown, taskId?: number) =>
  log('error', msg + (err instanceof Error ? `: ${err.message}` : ''), taskId)
