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
  createdAt: string
  updatedAt: string
  ruleCount?: number
}

export interface RuleSetInput {
  name: string
  description?: string
  isBuiltin?: boolean
  parentId?: number | null
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

/** 检测任务 */
export interface Task {
  id: number
  siteId: number
  ruleSetId: number
  status: TaskStatus
  score: number | null
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
  /** 可选：Google PageSpeed 接口 Key（留空用本地 Lighthouse） */
  psiApiKey: string
}

export const DEFAULT_REPORT_SETTINGS: ReportSettings = {
  companyName: '',
  logoPath: '/logo.svg',
  reportTitle: '网站合规性检测报告',
  footerText: '本报告由网站合规性检测工具自动生成',
  psiApiKey: ''
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

