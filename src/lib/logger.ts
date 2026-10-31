import { appendFileSync, mkdirSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { DATA_DIR } from './store'

export type LogLevel = 'info' | 'warn' | 'error' | 'debug'

let logDir = ''

function ensureLogDir(): string {
  if (!logDir) {
    logDir = join(DATA_DIR, 'logs')
    mkdirSync(logDir, { recursive: true })
  }
  return logDir
}

function formatLine(level: LogLevel, message: string, taskId?: number): string {
  const ts = new Date().toISOString()
  const tag = taskId != null ? ` [task:${taskId}]` : ''
  return `${ts} [${level.toUpperCase()}]${tag} ${message}`
}

/** 写一条日志：同时写入全局 app.log 与任务专属 task-{id}.log（不影响主流程） */
export function log(level: LogLevel, message: string, taskId?: number): void {
  try {
    const dir = ensureLogDir()
    const line = formatLine(level, message, taskId) + '\n'
    appendFileSync(join(dir, 'app.log'), line, 'utf8')
    if (taskId != null) {
      appendFileSync(join(dir, `task-${taskId}.log`), line, 'utf8')
    }
  } catch {
    // 日志写入失败不阻塞业务
  }
}

/** 读取任务日志（按行返回；无日志返回空数组） */
export function readTaskLog(taskId: number): string[] {
  try {
    const path = join(ensureLogDir(), `task-${taskId}.log`)
    if (!existsSync(path)) return []
    const raw = readFileSync(path, 'utf8')
    return raw.trim() ? raw.split(/\r?\n/).filter(Boolean) : []
  } catch {
    return []
  }
}

export const logInfo = (msg: string, taskId?: number) => log('info', msg, taskId)
export const logWarn = (msg: string, taskId?: number) => log('warn', msg, taskId)
export const logError = (msg: string, err?: unknown, taskId?: number) =>
  log('error', msg + (err instanceof Error ? `: ${err.message}` : ''), taskId)