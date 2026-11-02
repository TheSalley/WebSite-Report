/** 单条检测项结果状态 */
export type CheckStatus = 'pass' | 'warn' | 'fail' | 'skip' | 'verify'

/** 检测任务状态 */
export type TaskStatus = 'pending' | 'running' | 'success' | 'failed' | 'stopped'

/** 站点 */
export interface Site {
  id: number
  name: string
  url: string
  remark: string
  createdAt: string
  updatedAt: string
}

export interface SiteInput {
  name: string
  url: string
  remark?: string
}

/** 规则集 */
export interface RuleSet {
  id: number
  name: string
  description: string
  isBuiltin: boolean
  parentId: number | null
  /** 多页面模板检查：sitemap 枚举 + 模板去重，任务运行代表页 */
  scanPages: boolean
  createdAt: string
  updatedAt: string
  ruleCount?: number
}

export interface RuleSetInput {
  name: string
  description?: string
  isBuiltin?: boolean
  parentId?: number | null
  scanPages?: boolean
}

/** 单条规则定义 */
export interface Rule {
  id: number
  ruleSetId: number
  groupName: string
  ruleKey: string
  name: string
  enabled: boolean
  /** 交付成果文案（报告「交付成果」列；留空显示状态徽章） */
  deliverable?: string
  description?: string
  /** 执行范围：'site' 站点级（整站仅执行一次）| 'page' 页面级（每个代表页执行，默认） */
  scope?: 'page' | 'site'
  params: Record<string, unknown>
  sortOrder: number
}

export interface RuleInput {
  groupName: string
  ruleKey: string
  name: string
  enabled?: boolean
  params?: Record<string, unknown>
  sortOrder?: number
}

/** Elementor 隐藏板块明细项（报告逐页明细使用） */
export interface ElementorHiddenItem {
  tag: string
  id: string
  classes: string
  text: string
}

/** 站点级规则附带的结构化数据（按 ruleKey 类型化；动态 ruleKey 通过索引签名兜底） */
export interface SiteDataByRuleKey {
  'perf.pagespeed.score'?: PageSpeedReportData
  'delivery.h1.count'?: { pages: { url: string; h1s: string[] }[] }
  'delivery.elementor.hidden-both'?: { pages: { url: string; items: ElementorHiddenItem[] }[] }
  'delivery.sitemap'?: unknown
  [ruleKey: string]: unknown
}

/** 检测页面集：单个代表页 */
export interface TaskPageSetPage {
  url: string
  templateSignature: string
}

/** 检测页面集合（sitemap 枚举 + 模板去重结果） */
export interface TaskPageSet {
  /** 枚举到的 sitemap URL */
  sitemaps: string[]
  /** 候选页总数（含主页） */
  candidateCount: number
  /** sitemap 中提取到的全部 URL 总数 */
  locTotal: number
  /** 去重后的代表页（主页优先） */
  representatives: TaskPageSetPage[]
}

/** 检测任务 */
export interface Task {
  id: number
  siteId: number
  ruleSetId: number
  status: TaskStatus
  passCount: number
  warnCount: number
  failCount: number
  skipCount: number
  verifyCount?: number
  startedAt: string | null
  finishedAt: string | null
  /** 失败原因（任务 failed 时由引擎写入） */
  error?: string | null
  site?: Site
  ruleSet?: RuleSet
  /** PageSpeed 评分结果（任务执行时采集，可能为 null） */
  pagespeed?: PageSpeedReportData | null
  /** 检测页面集合（sitemap 枚举 + 模板去重结果，多页面任务才有） */
  pageSet?: TaskPageSet | null
  /** 站点级规则的结构化数据（按 ruleKey 类型化；报告按页面表格使用） */
  siteData?: SiteDataByRuleKey | null
}

export interface TaskInput {
  siteId: number
  ruleSetId: number
}

/** 单条检测结果 */
export interface CheckResult {
  id: number
  taskId: number
  ruleId: number | null
  ruleKey: string
  ruleName: string
  groupName: string
  /** 检测页面 URL（多页面任务按页面分组；旧单页任务为空） */
  pageUrl: string
  status: CheckStatus
  /** 交付成果文案（预留来自规则的预设/自定义） */
  deliverable?: string
  actualValue: string
  expectedValue: string
  description: string
  screenshotPath: string | null
  note: string
  checkedAt: string
}

/** 报告抬头/模板设置 */
export interface ReportSettings {
  companyName: string
  logoPath: string
  reportTitle: string
  footerText: string
}

export const DEFAULT_REPORT_SETTINGS: ReportSettings = {
  companyName: '',
  logoPath: '/logo.svg',
  reportTitle: '网站合规性检测报告',
  footerText: '本报告由网站合规性检测工具自动生成'
}

/** PageSpeed 单个类别评分（0-100） */
export interface PageSpeedCategoryScore {
  id: string
  title: string
  score: number | null
}

/** PageSpeed 核心指标 */
export interface PageSpeedMetricValue {
  id: string
  title: string
  displayValue: string
  score: number | null
}

/** 单一策略（移动端/桌面端）的 PageSpeed 结果 */
export interface PageSpeedStrategyResult {
  strategy: 'mobile' | 'desktop'
  fetchedAt: string
  ok: boolean
  error?: string
  categories: PageSpeedCategoryScore[]
  metrics: PageSpeedMetricValue[]
}

/** 一个任务的整体 PageSpeed 数据 */
export interface PageSpeedReportData {
  fetchedAt: string
  mobile: PageSpeedStrategyResult | null
  desktop: PageSpeedStrategyResult | null
  /** 整体失败说明（如 URL 无效） */
  error?: string
}

