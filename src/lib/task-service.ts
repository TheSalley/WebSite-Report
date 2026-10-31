import { join } from 'path'

import { DATA_DIR } from './store'
import type { CheckStatus, PageSpeedReportData } from './types'
import { runTask, shutdownEngine } from './engine/runner'
import { buildPageSet, type PageSetResult } from './engine/page-set'
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
  void runInBackground(taskId, site.url, ruleSet.scanPages === true, rules, state)

  return taskId
}

/** 后台执行引擎并保存结果 */
async function runInBackground(taskId: number, url: string, scanPages: boolean, rules: RuleRow[], state: RunningTaskState): Promise<void> {
  const startMillis = Date.now()
  try {
    // 多页面模板检查：sitemap 枚举 + 模板去重，仅检测代表页
    let pages: string[] = [url]
    let pageSetResult: PageSetResult | undefined
    if (scanPages) {
      pageSetResult = await buildPageSet(url, {
        signal: state.signal,
        onClassify: (doneCount, totalCount) => {
          state.done = doneCount
          state.total = totalCount
          state.currentRuleKey = 'page-set'
          state.currentRuleName = '枚举站点页面'
          state.lastStatus = null
        }
      })
      pages = pageSetResult.pages.map((i) => i.url)
      logInfo('页面集合（sitemap 枚举 + 模板去重）：' + pages.length + ' 个代表页', taskId)
      await updateTask(taskId, {
        pageSetJson: JSON.stringify({
          sitemaps: pageSetResult.sitemaps,
          candidateCount: pageSetResult.candidateCount,
          locTotal: pageSetResult.locTotal,
          representatives: pageSetResult.pages.map((p) => ({ url: p.url, templateSignature: p.templateSignature }))
        })
      })
      if (state.signal.cancelled) {
        logWarn('页面枚举阶段已取消', taskId)
        await updateTask(taskId, { status: 'stopped', finishedAt: new Date().toISOString() })
        return
      }
      // 站点级规则整站只跑 1 次，页面级规则按代表页执行
      const siteCount = rules.filter((r) => r.scope === 'site').length
      state.done = 0
      state.total = siteCount + (rules.length - siteCount) * pages.length
    }

    const result = await runTask({
      pages,
      rules,
      taskId,
      sitePageSet: pageSetResult
        ? { sitemaps: pageSetResult.sitemaps, locTotal: pageSetResult.locTotal, candidateCount: pageSetResult.candidateCount }
        : undefined,
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
    // 持久化站点级规则的结构化数据（如交付检查逐页明细），供报告按页面表格渲染
    if (result.siteData && Object.keys(result.siteData).length > 0) {
      await updateTask(taskId, { siteDataJson: JSON.stringify(result.siteData) })
    }

    // PageSpeed 评分：优先复用站点级规则 perf.pagespeed.score 已采集的数据，否则任务层独立采集
    const rulePs = result.siteData?.['perf.pagespeed.score'] as PageSpeedReportData | undefined
    // PageSpeed 评分与截图仅在建站服务合同验收等含 perf.pagespeed.score 规则的规则集执行；网站交付检查等其他规则集不采集
    const hasPagespeedRule = rules.some((r) => r.ruleKey === 'perf.pagespeed.score')
    state.currentRuleKey = 'pagespeed'
    state.currentRuleName = 'PageSpeed 评分与截图'
    logInfo('开始采集 PageSpeed 评分与截图', taskId)
    if (!hasPagespeedRule) {
      logInfo('规则集未包含 PageSpeed 规则（perf.pagespeed.score），跳过 PageSpeed 评分与截图', taskId)
    } else if (state.signal.cancelled) {
      logWarn('PageSpeed 采集前已被取消，跳过', taskId)
    } else {
      if (rulePs) {
        await updateTask(taskId, { pagespeedJson: JSON.stringify(rulePs) })
        logInfo('PageSpeed 评分已由站点级规则 perf.pagespeed.score 采集', taskId)
      } else {
        try {
          const pagespeed = await fetchPageSpeed(url)
          await updateTask(taskId, { pagespeedJson: JSON.stringify(pagespeed) })
          logInfo('PageSpeed 评分采集完成', taskId)
        } catch (e) {
          logError('PageSpeed 评分采集异常（不影响主结果）', e, taskId)
        }
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