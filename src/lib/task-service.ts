import { join } from 'path'

import { DATA_DIR } from './store'
import type { CheckStatus } from './types'
import { runTask, shutdownEngine } from './engine/runner'
import { computeScore } from './engine/scoring'
import { getBrowser } from './engine/browser'
import { fetchPageSpeed } from './engine/pagespeed'
import { capturePagespeedShots } from './pagespeed-shots'
import {
  createTask,
  getTask,
  getSite,
  getRuleSet,
  listRulesForSet,
  updateTask,
  saveCheckResults,
  updateCheckResultNote,
  updateCheckResultDeliverable,
  updateCheckResultStatus,
  listCheckResults,
  deleteTask
} from './store'
import type { RuleRow } from './store'
import { logInfo, logWarn, logError } from './logger'

/** 运行中任务的状态（进程内存） */
export interface RunningTaskState {
  taskId: number
  signal: { cancelled: boolean }
  done: number
  total: number
  currentRuleKey: string
  currentRuleName: string
  lastStatus: CheckStatus | null
  error: string | null
}

const runningTasks = new Map<number, RunningTaskState>()

export function getRunningState(taskId: number): RunningTaskState | null {
  return runningTasks.get(taskId) ?? null
}

/**
 * 创建并执行检测任务：
 * - 持久化 task 记录
 * - 后台执行浏览器引擎
 * - 保存结果与统计
 */
export async function startTask(siteId: number, ruleSetId: number): Promise<number> {
  const site = await getSite(siteId)
  const ruleSet = await getRuleSet(ruleSetId)
  if (!site || !ruleSet) throw new Error('站点或规则集不存在')

  const rules = (await listRulesForSet(ruleSetId)).filter((r) => r.enabled)
  if (rules.length === 0) throw new Error('规则集没有启用的规则')

  // 先持久化任务
  const task = await createTask({ siteId, ruleSetId })
  const taskId = task.id
  await updateTask(taskId, { status: 'running', startedAt: new Date().toISOString() })

  const state: RunningTaskState = {
    taskId,
    signal: { cancelled: false },
    done: 0,
    total: rules.length,
    currentRuleKey: '',
    currentRuleName: '',
    lastStatus: null,
    error: null
  }
  runningTasks.set(taskId, state)
  logInfo(`任务创建，site=${site.name} ruleset=${ruleSet.name} 共${rules.length}条规则`, taskId)

  // 后台执行（不阻塞 API 响应）
  void runInBackground(taskId, site.url, rules, state)

  return taskId
}

/** 后台执行引擎并保存结果 */
async function runInBackground(taskId: number, url: string, rules: RuleRow[], state: RunningTaskState): Promise<void> {
  const startMillis = Date.now()
  try {
    const result = await runTask({
      url,
      rules,
      taskId,
      screenshotBaseDir: join(DATA_DIR, 'screenshots'),
      signal: state.signal,
      onProgress: (done, total, ruleName, ruleKey, status) => {
        state.done = done
        state.total = total
        state.currentRuleKey = ruleKey
        state.currentRuleName = ruleName
        state.lastStatus = status
      }
    })

    if (state.signal.cancelled) {
      logWarn('任务已取消（规则检测阶段），保存已完成的中间结果', taskId)
      // 取消时仍保存已执行的结果，便于查看已完成部分
      await saveCheckResults(
        taskId,
        result.results.map((r) => ({ ...r, taskId, checkedAt: new Date().toISOString() }))
      )
      const score = result.score
      await updateTask(taskId, {
        status: 'stopped',
        score: score.score,
        passCount: score.passCount,
        warnCount: score.warnCount,
        failCount: score.failCount,
        skipCount: score.skipCount,
        verifyCount: score.verifyCount,
        finishedAt: new Date().toISOString()
      })
      return
    }

    // 保存结果
    await saveCheckResults(
      taskId,
      result.results.map((r) => ({
        ...r,
        taskId,
        checkedAt: new Date().toISOString()
      }))
    )
    const score = result.score
    await updateTask(taskId, {
      score: score.score,
      passCount: score.passCount,
      warnCount: score.warnCount,
      failCount: score.failCount,
      skipCount: score.skipCount,
      verifyCount: score.verifyCount
    })

    // 采集 PageSpeed 评分与页面截图（失败不阻塞任务状态，仅记录）
    state.currentRuleKey = 'pagespeed'
    state.currentRuleName = 'PageSpeed 评分与截图'
    logInfo('开始采集 PageSpeed 评分与截图', taskId)
    if (state.signal.cancelled) {
      logWarn('PageSpeed 采集前已被取消，跳过', taskId)
    } else {
      try {
        const pagespeed = await fetchPageSpeed(url)
        await updateTask(taskId, { pagespeedJson: JSON.stringify(pagespeed) })
        logInfo('PageSpeed 评分采集完成', taskId)
      } catch (e) {
        logError('PageSpeed 评分采集异常（不影响主结果）', e, taskId)
      }
      // 取消后不再截图
      if (state.signal.cancelled) {
        logWarn('PageSpeed 截图前检测到取消，跳过截图', taskId)
      } else {
        try {
          await capturePagespeedShots(taskId, url, state.signal)
          logInfo('PageSpeed 页面截图完成', taskId)
        } catch (e) {
          logError('PageSpeed 截图异常（任务已尽力，不影响主结果）', e, taskId)
        }
      }
    }

    // 全部采集完成后再收尾：任务状态与完成时间（检测时间包含 PageSpeed 截图耗时）
    const finishedAt = new Date().toISOString()
    await updateTask(taskId, {
      status: state.signal.cancelled ? 'stopped' : 'success',
      finishedAt
    })
    const elapsedSec = ((Date.now() - startMillis) / 1000).toFixed(1)
    logInfo(`任务完成，耗时 ${elapsedSec}s，状态=${state.signal.cancelled ? 'stopped' : 'success'}`, taskId)
  } catch (e) {
    state.error = (e as Error).message
    await updateTask(taskId, {
      status: 'failed',
      finishedAt: new Date().toISOString(),
      error: (e as Error).message
    })
    logError('任务执行失败', e, taskId)
  } finally {
    runningTasks.delete(taskId)
  }
}

/** 取消运行中的任务：立即返回，后台协程在安全点停止并保存状态 */
export async function cancelTask(taskId: number): Promise<boolean> {
  const running = runningTasks.get(taskId)
  if (!running) {
    // 任务不在内存中（可能已结束或服务器重启）：直接回写 stopped，避免“永远 running”
    const task = await getTask(taskId)
    if (task && task.status === 'running') {
      logWarn('任务不在运行表但状态为 running，直接标记为 stopped', taskId)
      await updateTask(taskId, { status: 'stopped', finishedAt: new Date().toISOString() })
      return true
    }
    return false
  }
  running.signal.cancelled = true
  logWarn('已发出取消信号', taskId)
  return true
}

export async function removeTask(taskId: number): Promise<void> {
  const running = runningTasks.get(taskId)
  if (running) running.signal.cancelled = true
  runningTasks.delete(taskId)
  await deleteTask(taskId)
}

export async function updateNote(resultId: number, note: string): Promise<void> {
  await updateCheckResultNote(resultId, note)
}

/** 人工填写交付成果：写入结果的 deliverable 列 */
export async function updateDeliverable(resultId: number, deliverable: string): Promise<void> {
  await updateCheckResultDeliverable(resultId, deliverable)
}

/** 人工验收：更新结果状态并重算所属任务的得分与统计 */
export async function updateResultStatus(resultId: number, status: CheckStatus): Promise<void> {
  const row = await updateCheckResultStatus(resultId, status)
  if (!row) return
  const all = await listCheckResults(row.taskId)
  const score = computeScore(all.map((r) => ({ status: r.status })))
  await updateTask(row.taskId, {
    score: score.score,
    passCount: score.passCount,
    warnCount: score.warnCount,
    failCount: score.failCount,
    skipCount: score.skipCount,
    verifyCount: score.verifyCount
  })
}

export { listCheckResults, getTask }

/** 应用关闭时清理 */
export async function shutdownServices(): Promise<void> {
  for (const running of runningTasks.values()) {
    running.signal.cancelled = true
  }
  await shutdownEngine()
}