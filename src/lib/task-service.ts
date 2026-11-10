import { join } from 'path'

import { DATA_DIR } from './store'
import { existsSync } from 'fs'
import type { CheckStatus } from './types'
import { runTask, shutdownEngine } from './engine/runner'
import { buildPageSet, type PageSetResult } from './engine/page-set'
import { countResults } from './engine/scoring'
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
  recoverStaleRunningTasks
} from './store'
import type { CheckResultRow, RuleRow } from './store'
import { logInfo, logWarn, logError } from './logger'

/** 任务阶段：排队 → 枚举站点页面 → 规则检测 → PageSpeed 截图 */
export type TaskPhaseId = 'queued' | 'enum' | 'detect' | 'pagespeed'

/** 任务阶段定义（供前端展示阶段进度） */
export interface TaskPhase {
  id: TaskPhaseId
  name: string
  done: number
  total: number
}

/** 运行中任务的状态（进程内存） */
export interface RunningTaskState {
  taskId: number
  signal: { cancelled: boolean }
  /** 当前阶段 */
  phase: TaskPhaseId
  /** 当前阶段显示名 */
  phaseName: string
  /** 当前阶段序号（1 起，如「阶段 2/3」） */
  phaseIndex: number
  /** 阶段总数 */
  phaseCount: number
  /** 当前阶段进度 */
  done: number
  total: number
  /** 是否排队等待执行（并发队列，默认同时 1 个） */
  queued: boolean
  currentRuleKey: string
  currentRuleName: string
  lastStatus: CheckStatus | null
  error: string | null
}

const runningTasks = new Map<number, RunningTaskState>()

/** 功能产物结果（如 PageSpeed 截图）：与检测结果同表保存，但不参与通过/失败统计 */
function artifactResult(
  rule: RuleRow,
  taskId: number,
  status: CheckResultRow['status'],
  actualValue: string,
  description: string
): Omit<CheckResultRow, 'id'> {
  return {
    taskId,
    ruleId: rule.id,
    ruleKey: rule.ruleKey,
    ruleName: rule.name,
    groupName: rule.groupName,
    kind: 'artifact',
    pageUrl: '',
    status,
    actualValue,
    expectedValue: '移动端/桌面端截图已保存',
    description,
    deliverable: rule.deliverable ?? '',
    screenshotPath: status === 'pass' ? `task-${taskId}/pagespeed-mobile.png` : null,
    note: '',
    checkedAt: new Date().toISOString()
  }
}

/** 合同文案结果：不打开页面检测，直接生成待验收记录 */
function deliverableResult(rule: RuleRow, taskId: number): Omit<CheckResultRow, 'id'> {
  return {
    taskId,
    ruleId: rule.id,
    ruleKey: rule.ruleKey,
    ruleName: rule.name,
    groupName: rule.groupName,
    kind: 'deliverable',
    pageUrl: '',
    status: 'verify',
    actualValue: '待人工验收',
    expectedValue: '按合同约定完成并确认',
    description: rule.description?.trim() || '人工交付项，需验收人员确认后更新状态',
    deliverable: rule.deliverable ?? '',
    screenshotPath: null,
    note: '',
    checkedAt: new Date().toISOString()
  }
}

/** 执行 PageSpeed 得分截图并生成功能产物结果；失败只记录为产物状态，不影响检测统计 */
async function capturePagespeedArtifact(
  taskId: number,
  url: string,
  rule: RuleRow,
  signal: { cancelled: boolean }
): Promise<Omit<CheckResultRow, 'id'>> {
  if (signal.cancelled) {
    return artifactResult(rule, taskId, 'skip', '任务已取消，未生成截图', '未生成截图')
  }
  try {
    await capturePagespeedShots(taskId, url, signal)
    if (signal.cancelled) logWarn('截图过程中任务被取消，保留已生成产物', taskId)
    const dir = join(DATA_DIR, 'screenshots', `task-${taskId}`)
    const saved = ['mobile', 'desktop'].filter((s) => existsSync(join(dir, `pagespeed-${s}.png`)))
    return saved.length === 2
      ? artifactResult(rule, taskId, 'pass', '已生成移动端/桌面端截图', '移动端/桌面端得分截图')
      : artifactResult(rule, taskId, 'fail', `仅生成 ${saved.length}/2 张截图`, '截图未完整生成')
  } catch (e) {
    logError('PageSpeed 截图异常（任务已尽力，不影响主结果）', e, taskId)
    return artifactResult(rule, taskId, 'fail', `截图失败：${(e as Error).message.slice(0, 120)}`, '截图生成失败')
  }
}

/**
 * 并发执行队列：默认同时执行 1 个任务，其余排队等待。
 * 多个任务共享单一 Chromium，避免 context/page 无界增长互相拖慢。
 * 可通过环境变量 WSR_MAX_CONCURRENT_RUNS 调整并发上限。
 */
const MAX_CONCURRENT_RUNS = Number(process.env.WSR_MAX_CONCURRENT_RUNS) || 1
let activeRuns = 0
const runQueue: (() => void)[] = []

/** 等待一个空闲任务位（满员时排队） */
async function acquireRunSlot(): Promise<void> {
  if (activeRuns < MAX_CONCURRENT_RUNS) {
    activeRuns++
    return
  }
  await new Promise<void>((resolve) => runQueue.push(resolve))
}

/** 释放任务位：优先让给队首等待者（槽位直接转移），否则减少活跃数 */
function releaseRunSlot(): void {
  const next = runQueue.shift()
  if (next) next()
  else activeRuns--
}

export function getRunningState(taskId: number): RunningTaskState | null {
  return runningTasks.get(taskId) ?? null
}

/**
 * 服务重启恢复：把 DB 中遗留 running 但本进程未在跑的任务标记为「中断」，
 * 防止进程崩溃/重启后任务永远显示「运行中」。在应用入口（initData）调用，幂等。
 */
export async function recoverInterruptedTasks(): Promise<number> {
  return recoverStaleRunningTasks(Array.from(runningTasks.keys()))
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
  if (!site || !ruleSet) throw new Error('站点或分组不存在')

  const rules = await listRulesForSet(ruleSetId)
  if (rules.length === 0) throw new Error('分组没有启用的规则')
  const checkRules = rules.filter((r) => r.kind === 'check')
  const deliverableRules = rules.filter((r) => r.kind === 'deliverable')
  const hasPagespeedShotRule = rules.some((r) => r.kind === 'artifact' && r.ruleKey === 'artifact.pagespeed.shots')
  if (checkRules.length === 0 && deliverableRules.length === 0 && !hasPagespeedShotRule) {
    throw new Error('分组没有可执行的检测、合同文案或截图项')
  }

  // 先持久化任务
  const task = await createTask({ siteId, ruleSetId })
  const taskId = task.id
  await updateTask(taskId, { status: 'running', startedAt: new Date().toISOString() })

  const state: RunningTaskState = {
    taskId,
    signal: { cancelled: false },
    phase: 'queued',
    phaseName: '排队中',
    phaseIndex: 0,
    phaseCount: 0,
    done: 0,
    total: 0,
    queued: true,
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
  const checkRules = rules.filter((r) => r.kind === 'check')
  const deliverableRules = rules.filter((r) => r.kind === 'deliverable')
  const manualResults = deliverableRules.map((rule) => deliverableResult(rule, taskId))
  // 并发队列：等待空闲任务位（排队期间前端展示「排队中」）
  await acquireRunSlot()
  state.queued = false
  try {
    // 排队期间被取消：直接收尾，不占用任务位
    if (state.signal.cancelled) {
      logWarn('排队期间任务被取消', taskId)
      await updateTask(taskId, { status: 'stopped', finishedAt: new Date().toISOString() })
      return
    }

    const hasDetection = checkRules.length > 0
    const shotRule = rules.find((r) => r.ruleKey === 'artifact.pagespeed.shots')
    const hasPagespeedShot = Boolean(shotRule)
    // 阶段序列：枚举 → 规则检测 → PageSpeed 截图（按规则集配置裁剪）
    const phases: TaskPhase[] = []
    if (hasDetection && scanPages) phases.push({ id: 'enum', name: '枚举站点页面', done: 0, total: 0 })
    if (hasDetection) phases.push({ id: 'detect', name: '规则检测', done: 0, total: 0 })
    if (hasPagespeedShot) phases.push({ id: 'pagespeed', name: 'PageSpeed 截图', done: 0, total: 0 })
    state.phaseCount = phases.length
    let phaseCursor = 0
    /** 进入阶段：重置进度与当前规则，避免跨阶段跳变 */
    const enterPhase = (id: TaskPhaseId, name: string, done: number, total: number): void => {
      const idx = phases.findIndex((p) => p.id === id)
      if (idx >= 0) phaseCursor = idx
      state.phase = id
      state.phaseName = name
      state.phaseIndex = phaseCursor + 1
      state.done = done
      state.total = total
      state.currentRuleKey = ''
      state.currentRuleName = ''
      state.lastStatus = null
    }

    // 多页面模板检查：sitemap 枚举 + 模板去重，仅检测代表页
    let pages: string[] = [url]
    let pageSetResult: PageSetResult | undefined
    if (hasDetection && scanPages) {
      enterPhase('enum', '枚举站点页面', 0, 0)
      pageSetResult = await buildPageSet(url, {
        signal: state.signal,
        onClassify: (doneCount, totalCount) => {
          state.done = doneCount
          state.total = totalCount
          state.currentRuleKey = 'page-set'
          state.currentRuleName = '分类页面 ' + doneCount + '/' + totalCount
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
      const siteCount = checkRules.filter((r) => r.scope === 'site').length
      enterPhase('detect', '规则检测', 0, siteCount + (checkRules.length - siteCount) * pages.length)
    } else if (hasDetection) {
      enterPhase('detect', '规则检测', 0, checkRules.length)
    }

    let result: Awaited<ReturnType<typeof runTask>> = { results: [], counts: countResults([]) }
    if (hasDetection) {
      result = await runTask({
        pages,
        rules: checkRules,
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
        await saveCheckResults(taskId, [
          ...result.results.map((r) => ({ ...r, kind: 'check' as const, taskId, checkedAt: new Date().toISOString() })),
          ...manualResults
        ])
        const counts = countResults([...result.results, ...manualResults])
        await updateTask(taskId, {
          status: 'stopped',
          passCount: counts.passCount,
          warnCount: counts.warnCount,
          failCount: counts.failCount,
          skipCount: counts.skipCount,
          verifyCount: counts.verifyCount,
          finishedAt: new Date().toISOString()
        })
        return
      }

      // 保存结果
      await saveCheckResults(taskId, [
        ...result.results.map((r) => ({ ...r, kind: 'check' as const, taskId, checkedAt: new Date().toISOString() })),
        ...manualResults
      ])
      const counts = countResults([...result.results, ...manualResults])
      await updateTask(taskId, {
        passCount: counts.passCount,
        warnCount: counts.warnCount,
        failCount: counts.failCount,
        skipCount: counts.skipCount,
        verifyCount: counts.verifyCount
      })
      // 持久化站点级规则的结构化数据（如交付检查逐页明细），供报告按页面表格渲染
      if (result.siteData && Object.keys(result.siteData).length > 0) {
        await updateTask(taskId, { siteDataJson: JSON.stringify(result.siteData) })
      }
    } else if (manualResults.length > 0) {
      // 仅合同文案任务：不打开浏览器，直接保存人工验收清单
      await saveCheckResults(taskId, manualResults)
      const counts = countResults(manualResults)
      await updateTask(taskId, {
        passCount: counts.passCount,
        warnCount: counts.warnCount,
        failCount: counts.failCount,
        skipCount: counts.skipCount,
        verifyCount: counts.verifyCount
      })
    }

    // PageSpeed 截图属于功能产物：只有勾选 artifact.pagespeed.shots 时才执行
    logInfo('开始生成 PageSpeed 截图', taskId)
    if (!hasPagespeedShot) {
      logInfo('规则集未包含 PageSpeed 截图项，跳过 PageSpeed 阶段', taskId)
    } else if (!hasDetection && hasPagespeedShot) {
      // 仅截图任务：无需打开页面做空检测，直接进入截图阶段
      logInfo('任务仅包含功能产物，跳过页面检测，直接生成 PageSpeed 截图', taskId)
      enterPhase('pagespeed', 'PageSpeed 截图', 0, 1)
      state.currentRuleKey = 'pagespeed'
      state.currentRuleName = '保存页面截图'
      const shotResult = await capturePagespeedArtifact(taskId, url, shotRule!, state.signal)
      await saveCheckResults(taskId, [...(await listCheckResults(taskId)), shotResult])
      state.done = 1
    } else if (state.signal.cancelled) {
      logWarn('PageSpeed 截图前已被取消，跳过', taskId)
    } else {
      enterPhase('pagespeed', 'PageSpeed 截图', 0, 1)
      state.currentRuleKey = 'pagespeed'
      state.currentRuleName = '保存页面截图'
      const shotResult = await capturePagespeedArtifact(taskId, url, shotRule!, state.signal)
      await saveCheckResults(taskId, [
        ...(await listCheckResults(taskId)),
        shotResult
      ])
      state.done = 1
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
    releaseRunSlot()
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

export async function updateNote(resultId: number, note: string): Promise<void> {
  await updateCheckResultNote(resultId, note)
}

/** 人工填写交付成果：写入结果的 deliverable 列 */
export async function updateDeliverable(resultId: number, deliverable: string): Promise<void> {
  await updateCheckResultDeliverable(resultId, deliverable)
}

/** 人工验收：更新结果状态并重算统计（不计算综合评分） */
export async function updateResultStatus(resultId: number, status: CheckStatus): Promise<void> {
  const row = await updateCheckResultStatus(resultId, status)
  if (!row) return
  const all = await listCheckResults(row.taskId)
  const counts = countResults(all.map((r) => ({ status: r.status, kind: r.kind, ruleKey: r.ruleKey })))
  await updateTask(row.taskId, {
    passCount: counts.passCount,
    warnCount: counts.warnCount,
    failCount: counts.failCount,
    skipCount: counts.skipCount,
    verifyCount: counts.verifyCount
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
