import { join } from 'path'
import { mkdir } from 'fs/promises'
import { DATA_DIR } from './store'
import type { CheckStatus } from './types'
import { runTask, shutdownEngine } from './engine/runner'
import { computeScore } from './engine/scoring'
import { getBrowser } from './engine/browser'
import { fetchPageSpeed } from './engine/pagespeed'
import {
  createTask,
  getTask,
  getSite,
  getRuleSet,
  listRulesForSet,
  updateTask,
  saveCheckResults,
  updateCheckResultNote,
  updateCheckResultStatus,
  listCheckResults,
  deleteTask
} from './store'
import type { RuleRow } from './store'

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

/** 采集 pagespeed.web.dev 测速得分报告截图（移动端/桌面端） */
async function capturePagespeedShots(taskId: number, url: string): Promise<void> {
  try {
    const dir = join(DATA_DIR, 'screenshots', 'task-' + taskId)
    await mkdir(dir, { recursive: true })
    const browser = await getBrowser()
    const context = await browser.newContext({
      viewport: { width: 1366, height: 1400 },
      locale: 'zh-CN',
      deviceScaleFactor: 1
    })
    try {
      const page = await context.newPage()

      /** 轮询等待得分卡片出现（页面报告文本出现 性能+无障碍 分数即可） */
      const waitScoreDom = async (timeoutMs: number): Promise<boolean> => {
        const deadline = Date.now() + timeoutMs
        while (Date.now() < deadline) {
          const ready = await page
            .evaluate(() => {
              const w = document.querySelector('.lh-scores-wrapper') as HTMLElement | null
              const hasScore = /性能\s*\d{1,3}/.test(document.body.innerText || '') && /无障碍\s*\d{1,3}/.test(document.body.innerText || '')
              return !!w && hasScore
            })
            .catch(() => false)
          if (ready) return true
          await page.waitForTimeout(3000)
        }
        return false
      }

      /** 截取得分报告区域：诊断标题 + 得分卡片 + 指标区 */
      const shotScore = async (strategy: string): Promise<void> => {
        if (!(await waitScoreDom(240000))) {
          console.warn('pagespeed.web.dev ' + strategy + ' 得分等待超时，跳过截图')
          return
        }
        // 滚动到得分卡片顶部，留出标题空间
        await page.evaluate(() => {
          const w = document.querySelector('.lh-scores-wrapper') as HTMLElement | null
          if (w) {
            const y = Math.max(0, w.getBoundingClientRect().top + window.scrollY - 90)
            window.scrollTo(0, y)
          }
        })
        await page.waitForTimeout(1500)
        // 计算截图区域（含标题 + 得分卡 + 部分指标）
        const clip = await page.evaluate(() => {
          const wrapper = document.querySelector('.lh-scores-wrapper') as HTMLElement | null
          if (!wrapper) return null
          const rect = wrapper.getBoundingClientRect()
          const visibleW = wrapper.scrollWidth || rect.width
          const visibleH = wrapper.scrollHeight || rect.height
          if (visibleW < 200 || rect.height < 10) return null
          const left = Math.max(0, rect.left - 24)
          const top = Math.max(0, rect.top - 14)
          return {
            x: left,
            y: top,
            width: Math.min(window.innerWidth - left, visibleW + 48),
            height: Math.min(window.innerHeight - top, Math.max(visibleH, 140) + 560)
          }
        })
        const file = join(dir, 'pagespeed-' + strategy + '.png')
        if (clip && clip.width >= 300 && clip.height >= 200) {
          await page.screenshot({ path: file, clip })
        } else {
          await page.screenshot({ path: file })
        }
        console.log('pagespeed.web.dev ' + strategy + ' 得分报告截图已保存: ' + file)
      }

      // 关闭 Cookie 横幅
      const baseTarget = 'https://pagespeed.web.dev/analysis?url=' + encodeURIComponent(url)

      // 移动端：打开默认分析页（自动触发移动端测速）
      await page
        .goto(baseTarget, { waitUntil: 'domcontentloaded', timeout: 60000 })
        .catch(() => undefined)
      try {
        const cookieBtn = page.getByText('知道了', { exact: true })
        if (await cookieBtn.isVisible({ timeout: 3000 })) await cookieBtn.click()
      } catch {
        /* 无横幅则忽略 */
      }
      await shotScore('mobile')

      // 桌面端：点击「桌面设备」按钮触发桌面端分析（直接 goto desktop URL 不会触发）
      try {
        const desktopBtn = page.getByText('桌面设备', { exact: true }).first()
        await desktopBtn.click({ timeout: 15000 })
        console.log('pagespeed.web.dev 已切换桌面设备')
      } catch {
        // 兜底：重新打开默认页并再次尝试
        try {
          await page
            .goto(baseTarget, { waitUntil: 'domcontentloaded', timeout: 60000 })
            .catch(() => undefined)
          const desktopBtn2 = page.getByText('桌面设备', { exact: true }).first()
          await desktopBtn2.click({ timeout: 15000 })
        } catch {
          console.warn('pagespeed.web.dev 桌面端切换失败，跳过桌面截图')
        }
      }
      await shotScore('desktop')
    } finally {
      await context.close().catch(() => undefined)
    }
  } catch (e) {
    // 忽略：pagespeed.web.dev 截图失败不阻塞任务
    console.warn('pagespeed.web.dev 截图异常: ' + (e as Error).message)
  }
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

  // 后台执行（不阻塞 API 响应）
  void runInBackground(taskId, site.url, rules, state)

  return taskId
}

/** 后台执行引擎并保存结果 */
async function runInBackground(taskId: number, url: string, rules: RuleRow[], state: RunningTaskState): Promise<void> {
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
      await updateTask(taskId, { status: 'stopped', finishedAt: new Date().toISOString() })
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
      status: 'success',
      score: score.score,
      passCount: score.passCount,
      warnCount: score.warnCount,
      failCount: score.failCount,
      skipCount: score.skipCount,
      verifyCount: score.verifyCount,
      finishedAt: new Date().toISOString()
    })

    // 采集 PageSpeed 评分与页面截图（失败不阻塞任务状态，仅记录）
    try {
      const pagespeed = await fetchPageSpeed(url)
      await updateTask(taskId, { pagespeedJson: JSON.stringify(pagespeed) })
      await capturePagespeedShots(taskId, url)
    } catch {
      // 忽略：网络/配额问题不影响主检测结果
    }
  } catch (e) {
    state.error = (e as Error).message
    await updateTask(taskId, {
      status: 'failed',
      finishedAt: new Date().toISOString()
    })
  } finally {
    runningTasks.delete(taskId)
  }
}

/** 取消运行中的任务 */
export async function cancelTask(taskId: number): Promise<void> {
  const running = runningTasks.get(taskId)
  if (running) {
    running.signal.cancelled = true
  }
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

/** 人工验收：更新结果状态并重算所属任务的得分与统计 */
export async function updateResultStatus(resultId: number, status: CheckStatus): Promise<void> {
  const row = await updateCheckResultStatus(resultId, status)
  if (!row) return
  const all = await listCheckResults(row.taskId)
  const score = computeScore(all.map((r) => ({ status: r.status, severity: r.severity })))
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
