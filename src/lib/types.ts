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
  /** 页面级规则的多页面检查：sitemap 枚举 + 模板去重；H1/隐藏板块始终按 sitemap 内容链接逐页检查 */
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

/** 规则类型：check 机器检测 | deliverable 合同文案 | artifact 功能产物 */
export type RuleKind = 'check' | 'deliverable' | 'artifact'

/** 规则类型元数据（全站唯一来源：规则库、任务详情、报告共用同一套命名） */
export const RULE_KINDS: ReadonlyArray<{
  key: RuleKind
  label: string
  description: string
}> = [
  {
    key: 'check',
    label: '机器检测',
    description: '由浏览器规则实际检查，计入通过 / 失败 / 跳过统计'
  },
  {
    key: 'deliverable',
    label: '合同文案',
    description: '合同承诺或交付说明，不参与机器检测；需人工确认验收状态'
  },
  {
    key: 'artifact',
    label: '功能产物',
    description: '截图、评分图等证据产物；单独留存，不参与通过率和报告合计'
  }
]

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
  /** 规则类型：机器检测 / 合同文案 / 功能产物（如截图） */
  kind?: RuleKind
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

/** sitemap 内容计数：只统计页面、新闻（post）、产品 */
export interface SitemapContentCounts {
  pages: number
  posts: number
  products: number
}

/** 检测页面集合（sitemap 枚举 + 模板去重结果） */
export interface TaskPageSet {
  /** 枚举到的 sitemap URL */
  sitemaps: string[]
  /** 候选页总数（含主页） */
  candidateCount: number
  /** sitemap 中提取到的全部 URL 总数（含 taxonomy、用户等其他类型） */
  locTotal: number
  /** 页面/新闻/产品数量（taxonomy、用户、其他 CPT 不计入） */
  contentCounts?: SitemapContentCounts
  /** 按 sitemap 内容链接逐页检查的数量（H1、隐藏板块使用） */
  contentPageCount?: number
  /** 本次任务是否按 sitemap 内容链接逐页采集了快照（H1 / 隐藏板块） */
  contentCheck?: boolean
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
  /** 结果类型：check 机器检测 | deliverable 合同文案 | artifact 功能产物 */
  kind?: RuleKind
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
  reportTitle: '网站检测报告',
  footerText: '本报告由网站部检测工具自动生成'
}

