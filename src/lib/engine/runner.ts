import { newPage, closeBrowser } from './browser'
import { attachNetworkCollector } from './network-collector'
import { captureSnapshot } from './snapshot'
import { ScreenshotManager } from './screenshot-manager'
import { getRuleHandler } from './rules'
import { computeScore, type ScoreResult } from './scoring'
import { join } from 'path'
import { tmpdir } from 'os'
import type { RuleContext, RuleOutcome } from './types'
import type { CheckStatus, Severity } from '../types'

export interface RunTaskOptions {
  url: string
  rules: { id: number; ruleKey: string; name: string; groupName: string; severity: Severity; enabled: boolean; params: Record<string, unknown> }[]
  taskId: number
  /** 截图根目录（默认临时目录 web-report-screenshots） */
  screenshotBaseDir?: string
  /** 取消信号 */
  signal?: { cancelled: boolean }
  /** 每完成一条规则的进度回调 */
  onProgress?: (done: number, total: number, ruleName: string, ruleKey: string, status: CheckStatus) => void
}

/** 单条规则完成的结果（用于持久化） */
export interface RunRuleResult {
  ruleId: number | null
  ruleKey: string
  ruleName: string
  groupName: string
  severity: Severity
  status: CheckStatus
  actualValue: string
  expectedValue: string
  description: string
  screenshotPath: string | null
  note: string
}

/** 任务运行结果 */
export interface RunResult {
  results: RunRuleResult[]
  score: ScoreResult
}

/**
 * 执行一次完整检测任务：
 * 1. 新建浏览器页面并挂载网络采集
 * 2. 导航到目标 URL 采集页面快照
 * 3. 按规则集顺序执行每条启用规则
 * 4. 失败/警告项自动截屏取证
 * 5. 计算得分返回
 */
export async function runTask(options: RunTaskOptions): Promise<RunResult> {
  const { url, rules, taskId } = options
  const enabledRules = rules.filter((r) => r.enabled)
  const total = enabledRules.length
  let done = 0

  const baseDir = options.screenshotBaseDir ?? join(tmpdir(), 'web-report-screenshots')
  const screenshotManager = new ScreenshotManager(taskId, baseDir)
  const page = await newPage()
  attachNetworkCollector(page)

  const results: RunRuleResult[] = []

  try {
    // 加载页面
    let snapshot: Awaited<ReturnType<typeof captureSnapshot>>
    try {
      await page.goto(url, { waitUntil: 'load', timeout: 45000 })
      snapshot = await captureSnapshot(page)
    } catch (e) {
      // 页面加载失败：全部规则标记为未执行，另加一条任务级失败说明
      const msg = (e as Error).message.slice(0, 200)
      results.push({
        ruleId: null,
        ruleKey: 'task.page_load',
        ruleName: '页面加载',
        groupName: '任务',
        severity: 'critical',
        status: 'fail',
        actualValue: '加载失败',
        expectedValue: '页面可访问',
        description: msg,
        screenshotPath: null,
        note: ''
      })
      for (const rule of enabledRules) {
        results.push({
          ruleId: rule.id,
          ruleKey: rule.ruleKey,
          ruleName: rule.name,
          groupName: rule.groupName,
          severity: rule.severity,
          status: 'skip',
          actualValue: '',
          expectedValue: '',
          description: '页面加载失败，未执行',
          screenshotPath: null,
          note: ''
        })
      }
      const score = computeScore(results.map((r) => ({ status: r.status, severity: r.severity })))
      return { results, score }
    }

    // 构建规则上下文（一次，每条规则仅改 params/ruleKey）
    const ctx: RuleContext = {
      snapshot,
      params: {},
      ruleKey: '',
      page,
      request: page.context().request,
      capture: (name: string) => screenshotManager.capture(page, name)
    }

    // 逐条执行规则
    for (const rule of enabledRules) {
      if (options.signal?.cancelled) break

      const handler = getRuleHandler(rule.ruleKey)
      ctx.params = rule.params ?? {}
      ctx.ruleKey = rule.ruleKey

      let outcome: RuleOutcome = rule.ruleKey.startsWith('verify.')
        ? {
            status: 'verify',
            actual: '待人工验收',
            expected: '按合同约定完成并确认',
            description: '人工交付项，需验收人员确认后更新状态'
          }
        : {
            status: 'fail',
            actual: '',
            expected: '',
            description: '规则未实现'
          }

      if (handler) {
        try {
          outcome = await handler(ctx)
        } catch (e) {
          outcome = {
            status: 'fail',
            actual: (e as Error).message.slice(0, 120),
            expected: '规则执行成功',
            description: `规则执行异常: ${(e as Error).message.slice(0, 80)}`
          }
        }
      }

      // 失败/警告 → 截屏取证
      let screenshotPath: string | null = null
      if (outcome.status === 'fail' || outcome.status === 'warn') {
        screenshotPath = await screenshotManager.capture(page, rule.ruleKey)
      }

      results.push({
        ruleId: rule.id,
        ruleKey: rule.ruleKey,
        ruleName: rule.name,
        groupName: rule.groupName,
        severity: rule.severity,
        status: outcome.status,
        actualValue: outcome.actual,
        expectedValue: outcome.expected,
        description: outcome.description,
        screenshotPath,
        note: ''
      })
      done++
      options.onProgress?.(done, total, rule.name, rule.ruleKey, outcome.status)
    }

    // 若被取消，剩余规则标记 skip
    if (options.signal?.cancelled) {
      for (const rule of enabledRules.slice(results.length)) {
        results.push({
          ruleId: rule.id,
          ruleKey: rule.ruleKey,
          ruleName: rule.name,
          groupName: rule.groupName,
          severity: rule.severity,
          status: 'skip',
          actualValue: '',
          expectedValue: '',
          description: '任务已取消',
          screenshotPath: null,
          note: ''
        })
      }
    }

    const score = computeScore(results.map((r) => ({ status: r.status, severity: r.severity })))
    return { results, score }
  } finally {
    await page.context().close().catch(() => undefined)
  }
}

export async function shutdownEngine(): Promise<void> {
  await closeBrowser()
}
