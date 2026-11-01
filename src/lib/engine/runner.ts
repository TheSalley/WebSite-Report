import { newPage, closeBrowser } from './browser'
import { attachNetworkCollector } from './network-collector'
import { captureSnapshot } from './snapshot'
import { ScreenshotManager } from './screenshot-manager'
import { getRuleHandler } from './rules'
import { countResults, type ResultCounts } from './scoring'
import { join } from 'path'
import { tmpdir } from 'os'
import type { PageSnapshot, RuleContext, RuleOutcome } from './types'
import type { CheckStatus, SiteDataByRuleKey } from '../types'
import { logInfo, logWarn, logError } from '../logger'

export interface RunTaskOptions {
  /** 页面集合（有序，pages[0] 为站点主页） */
  pages: string[]
  /** 页面枚举阶段已采集的站点级数据（供站点级规则使用，避免重复抓取 sitemap） */
  sitePageSet?: { sitemaps: string[]; locTotal: number; candidateCount: number }
  rules: { id: number; ruleKey: string; name: string; groupName: string; enabled: boolean; description?: string; deliverable?: string; scope?: 'page' | 'site'; params: Record<string, unknown> }[]
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
  /** 检测页面 URL（多页面任务按页面分组） */
  pageUrl: string
  status: CheckStatus
  actualValue: string
  expectedValue: string
  description: string
  /** 交付成果文案（预设/自定义） */
  deliverable: string
  screenshotPath: string | null
  note: string
}

/** 任务运行结果 */
export interface RunResult {
  results: RunRuleResult[]
  counts: ResultCounts
  /** 站点级规则附带采集的原始数据（按 ruleKey 类型化，供任务层持久化展示） */
  siteData?: SiteDataByRuleKey
}

type RuleDef = RunTaskOptions['rules'][number]

/**
 * 执行一次完整检测任务（可覆盖多个页面）：
 * 1. 逐页打开浏览器并按规则检测
 * 2. 失败/警告项自动截屏取证
 * 3. 聚合全部页面结果并统计各状态数量
 */
export async function runTask(options: RunTaskOptions): Promise<RunResult> {
  const { pages, rules, taskId } = options
  const enabledRules = rules.filter((r) => r.enabled)
  // 站点级规则（整站检查）仅在任务中执行一次；页面级规则按代表页执行
  const siteRules = enabledRules.filter((r) => r.scope === 'site')
  const pageRules = enabledRules.filter((r) => r.scope !== 'site')
  const total = siteRules.length + pageRules.length * pages.length
  let done = 0
  const siteData: SiteDataByRuleKey = {}
  const pageSnapshots: { url: string; snapshot: PageSnapshot }[] = []

  logInfo(`开始检测任务 taskId=${taskId} 页面数=${pages.length} 启用规则数=${enabledRules.length}（共 ${total} 项）`, taskId)
  const baseDir = options.screenshotBaseDir ?? join(tmpdir(), 'web-report-screenshots')
  const screenshotManager = new ScreenshotManager(taskId, baseDir)
  const results: RunRuleResult[] = []

  /** 结果说明：优先取规则配置的 description（合同条款），否则用引擎动态描述 */
  const desc = (rule: RuleDef, fallback: string): string =>
    rule.description && rule.description.trim() ? rule.description.trim() : fallback

  pageLoop: for (let pi = 0; pi < pages.length; pi++) {
    const url = pages[pi]
    if (options.signal?.cancelled) {
      logWarn(`任务取消信号已置位，跳过剩余页面（页面 ${pi + 1}/${pages.length}）`, taskId)
      break
    }
    const page = await newPage()
    attachNetworkCollector(page)

    try {
      // 加载页面
      let snapshot: Awaited<ReturnType<typeof captureSnapshot>>
      try {
        await page.goto(url, { waitUntil: 'load', timeout: 45000 })
        snapshot = await captureSnapshot(page)
        // 缓存快照供站点级聚合规则使用
        pageSnapshots.push({ url: snapshot.finalUrl || url, snapshot })
      } catch (e) {
        // 页面加载失败：标注页面加载失败，该页全部规则 skip，继续后续页面
        const msg = (e as Error).message.slice(0, 200)
        logError(`页面加载失败 ${url}`, e, taskId)
        results.push({
          ruleId: null,
          ruleKey: 'task.page_load',
          ruleName: '页面加载',
          groupName: '任务',
          pageUrl: url,
          status: 'fail',
          actualValue: '加载失败',
          expectedValue: '页面可访问',
          description: msg,
          deliverable: '',
          screenshotPath: null,
          note: ''
        })
        for (const rule of pageRules) {
          results.push({
            ruleId: rule.id,
            ruleKey: rule.ruleKey,
            ruleName: rule.name,
            groupName: rule.groupName,
            pageUrl: url,
            status: 'skip',
            actualValue: '',
            expectedValue: '',
            description: '页面加载失败，未执行',
            deliverable: rule.deliverable ?? '',
            screenshotPath: null,
            note: ''
          })
        }
        done += pageRules.length
        options.onProgress?.(done, total, '页面加载', 'task.page_load', 'fail')
        continue
      }

      // 构建规则上下文（每条规则仅改 params/ruleKey）
      const ctx: RuleContext = {
        snapshot,
        params: {},
        ruleKey: '',
        page,
        request: page.context().request,
        capture: (name: string) => screenshotManager.capture(page, pi === 0 ? name : `p${pi}-${name}`)
      }

      // 逐条执行页面级规则（该页）
      for (const rule of pageRules) {
        if (options.signal?.cancelled) {
          logWarn(`任务取消信号已置位，终止于 ${rule.ruleKey}（${url}）`, taskId)
          break pageLoop
        }
        logInfo(`执行规则 ${rule.ruleKey}（${rule.name}） @ ${url}`, taskId)

        const handler = getRuleHandler(rule.ruleKey)
        ctx.params = rule.params ?? {}
        ctx.ruleKey = rule.ruleKey

        let outcome: RuleOutcome
        if (rule.params?.defaultPass === true) {
          // 规则配置为「默认通过」：跳过实际检测，直接按通过计
          outcome = {
            status: 'pass',
            actual: '默认通过（规则已配置为直接通过）',
            expected: '按合同约定完成并确认',
            description: '该规则已配置为默认通过，无需实际检测'
          }
        } else {
          outcome = rule.ruleKey.startsWith('verify.')
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

          // 非 verify 规则且有处理器：执行实际检测（defaultPass 时不进入这里）
          if (handler && outcome.status === 'fail') {
            try {
              outcome = await handler(ctx)
            } catch (e) {
              logError(`规则 ${rule.ruleKey} 执行异常`, e, taskId)
              outcome = {
                status: 'fail',
                actual: (e as Error).message.slice(0, 120),
                expected: '规则执行成功',
                description: `规则执行异常: ${(e as Error).message.slice(0, 80)}`
              }
            }
          }
        }

        // 失败/警告 → 截屏取证
        let screenshotPath: string | null = null
        if (outcome.status === 'fail' || outcome.status === 'warn') {
          screenshotPath = await screenshotManager.capture(page, pi === 0 ? rule.ruleKey : `p${pi}-${rule.ruleKey}`)
        }

        results.push({
          ruleId: rule.id,
          ruleKey: rule.ruleKey,
          ruleName: rule.name,
          groupName: rule.groupName,
          pageUrl: url,
          status: outcome.status,
          actualValue: outcome.actual,
          expectedValue: outcome.expected,
          description: desc(rule, outcome.description),
          deliverable: rule.deliverable ?? '',
          screenshotPath,
          note: ''
        })
        done++
        options.onProgress?.(done, total, rule.name, rule.ruleKey, outcome.status)
      }
    } finally {
      await page.context().close().catch(() => undefined)
    }
  }

  // 站点级规则：全部代表页采集完成后执行一次（可聚合整站快照；不依赖页面上下文，失败/警告不截屏）
  if (siteRules.length > 0) {
    const siteUrl = pages[0] ?? ''
    const siteCtx: RuleContext = {
      snapshot: { finalUrl: siteUrl } as unknown as PageSnapshot,
      pageSet: options.sitePageSet,
      pageSnapshots,
      params: {},
      ruleKey: '',
      capture: async () => null
    }
    for (const rule of siteRules) {
      if (options.signal?.cancelled) {
        results.push({
          ruleId: rule.id,
          ruleKey: rule.ruleKey,
          ruleName: rule.name,
          groupName: rule.groupName,
          pageUrl: siteUrl,
          status: 'skip',
          actualValue: '',
          expectedValue: '',
          description: '任务已取消，站点级规则未执行',
          deliverable: rule.deliverable ?? '',
          screenshotPath: null,
          note: ''
        })
        done++
        continue
      }
      logInfo(`执行站点级规则 ${rule.ruleKey}（${rule.name}） @ ${siteUrl}`, taskId)
      siteCtx.params = rule.params ?? {}
      siteCtx.ruleKey = rule.ruleKey

      let outcome: RuleOutcome
      if (rule.params?.defaultPass === true) {
        outcome = {
          status: 'pass',
          actual: '默认通过（规则已配置为直接通过）',
          expected: '按合同约定完成并确认',
          description: '该规则已配置为默认通过，无需实际检测'
        }
      } else if (rule.ruleKey.startsWith('verify.')) {
        // 人工交付项：不做自动检测，标记为「待人工验收」（与页面级规则一致）
        outcome = {
          status: 'verify',
          actual: '待人工验收',
          expected: '按合同约定完成并确认',
          description: '人工交付项，需验收人员确认后更新状态'
        }
      } else {
        outcome = { status: 'fail', actual: '', expected: '', description: '规则未实现' }
        const handler = getRuleHandler(rule.ruleKey)
        if (handler) {
          try {
            outcome = await handler(siteCtx)
          } catch (e) {
            logError(`规则 ${rule.ruleKey} 执行异常`, e, taskId)
            outcome = {
              status: 'fail',
              actual: (e as Error).message.slice(0, 120),
              expected: '规则执行成功',
              description: `规则执行异常: ${(e as Error).message.slice(0, 80)}`
            }
          }
        }
      }
      results.push({
        ruleId: rule.id,
        ruleKey: rule.ruleKey,
        ruleName: rule.name,
        groupName: rule.groupName,
        pageUrl: siteUrl,
        status: outcome.status,
        actualValue: outcome.actual,
        expectedValue: outcome.expected,
        description: desc(rule, outcome.description),
        deliverable: rule.deliverable ?? '',
        screenshotPath: null,
        note: ''
      })
      if (outcome.data !== undefined) {
        siteData[rule.ruleKey] = outcome.data
      }
      done++
      options.onProgress?.(done, total, rule.name, rule.ruleKey, outcome.status)
    }
  }

  // 若被取消，剩余 (页面, 规则) 组合标记 skip
  if (options.signal?.cancelled && done < total) {
    const need = total - done
    const filled = new Set(
      results.filter((r) => r.ruleKey !== 'task.page_load').map((r) => `${r.pageUrl}::${r.ruleKey}`)
    )
    let filledCount = 0
    cancelFill: for (let pi = 0; pi < pages.length; pi++) {
      for (const rule of pageRules) {
        if (filledCount >= need) break cancelFill
        const key = `${pages[pi]}::${rule.ruleKey}`
        if (filled.has(key)) continue
        results.push({
          ruleId: rule.id,
          ruleKey: rule.ruleKey,
          ruleName: rule.name,
          groupName: rule.groupName,
          pageUrl: pages[pi],
          status: 'skip',
          actualValue: '',
          expectedValue: '',
          description: '任务已取消',
          deliverable: rule.deliverable ?? '',
          screenshotPath: null,
          note: ''
        })
        filled.add(key)
        filledCount++
      }
    }
  }

  logInfo(`检测完成，规则结果数=${results.length}`, taskId)
  const counts = countResults(results.map((r) => ({ status: r.status })))
  return { results, counts, siteData: Object.keys(siteData).length > 0 ? siteData : undefined }
}

export async function shutdownEngine(): Promise<void> {
  await closeBrowser()
}