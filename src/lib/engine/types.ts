import type { Page, APIRequestContext } from 'playwright'

/** 页面快照：一次浏览器检测采集到的全部原始数据，供所有规则共享 */
export interface PageSnapshot {
  /** 最终 URL（可能经历重定向） */
  finalUrl: string
  /** 页面标题 */
  title: string
  /** 全部 meta 标签（name/content 映射，小写） */
  metas: Record<string, string>
  /** 全部 link 标签（rel -> href 映射） */
  links: Record<string, string>
  /** 全部 og 标签（property -> content） */
  ogTags: Record<string, string>
  /** 页面内 h1 列表 */
  h1s: string[]
  /** Elementor 中同时含 elementor-hidden-desktop 与 elementor-hidden-mobile class 的元素（桌面+移动端同时隐藏） */
  elementorHiddenBoth: { tag: string; id: string; classes: string; text: string }[]
  /** 模板签名：过滤实例噪音（page-id/postid/slug 等）后的 body class 集合，用于模板级去重 */
  templateSignature: string
  /** 页面内全部链接 href */
  allHrefs: string[]
  /** 页面可见文本 */
  bodyText: string
  /** 是否设置 viewport meta */
  hasViewport: boolean
  /** charset 声明值（小写） */
  charset: string
  /** 页面加载性能指标（ms） */
  perf: {
    ttfb: number
    domContentLoaded: number
    load: number
    lcp: number
  }
  /** 网络传输统计 */
  network: {
    totalBytes: number
    requestCount: number
    responseHeaders: Record<string, Record<string, string>>
    mainResponseHeaders: Record<string, string>
    mainStatus: number
    consoleErrors: string[]
    mixedContents: string[]
    requests: { url: string; resourceType: string; status: number; size: number }[]
  }
}

/** 规则执行上下文 */
export interface RuleContext {
  snapshot: PageSnapshot
  /** 页面枚举阶段已采集的站点级数据（站点级规则优先使用，避免重复抓取） */
  pageSet?: {
    sitemaps: string[]
    locTotal: number
    candidateCount: number
  }
  /** 全部代表页的成功快照（站点级聚合规则使用，如全站 H1/Elementor 汇总） */
  pageSnapshots?: { url: string; snapshot: PageSnapshot }[]
  /** 规则参数（可配置） */
  params: Record<string, unknown>
  /** 截图取证：失败/警告时调用，返回保存后的文件路径 */
  capture: (name: string) => Promise<string | null>
  /** 规则名（供截图文件名） */
  ruleKey: string
  /** 页面实例（用于附加请求） */
  page?: Page
  /** API 请求上下文（供 robots/sitemap 等附加请求） */
  request?: APIRequestContext
}

/** 单条规则的执行输出 */
export interface RuleOutcome {
  status: 'pass' | 'warn' | 'fail' | 'verify'
  actual: string
  expected: string
  description: string
  /** 可选：规则采集的原始数据（站点级规则附带，随结果返回任务层持久化） */
  data?: unknown
}

/** 规则处理器签名 */
export type RuleHandler = (ctx: RuleContext) => Promise<RuleOutcome>
