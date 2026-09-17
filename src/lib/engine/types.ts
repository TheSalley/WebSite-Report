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
}

/** 规则处理器签名 */
export type RuleHandler = (ctx: RuleContext) => Promise<RuleOutcome>
