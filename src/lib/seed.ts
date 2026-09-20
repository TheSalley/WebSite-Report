import type { Severity } from './types'

/** 内置默认规则集种子数据（与原桌面版 25 条规则一一对应） */

const GROUP_SEO = 'SEO'
const GROUP_PERF = '性能'
const GROUP_SECURITY = '安全'
const GROUP_CONTENT = '内容与可用性'
const GROUP_COMPLIANCE = '合规（按需启用）'
const GROUP_PLAN = '网站规划'
const GROUP_BUILD = '网站建设'
const GROUP_OPTIMIZE = '功能与优化'
const GROUP_ADMIN = '后台管理'
const GROUP_CONTENT_FILL = '图文内容'
const GROUP_SUPPORT = '售后支持'

interface SeedRule {
  groupName: string
  ruleKey: string
  name: string
  severity: Severity
  params?: Record<string, unknown>
}

const seedRules: SeedRule[] = [
  // ── SEO ──
  { groupName: GROUP_SEO, ruleKey: 'seo.title.exists', name: 'title 标签存在且非空', severity: 'critical', params: {} },
  { groupName: GROUP_SEO, ruleKey: 'seo.title.length', name: 'title 长度合理（≤ 60 字符）', severity: 'warning', params: { maxLength: 60 } },
  { groupName: GROUP_SEO, ruleKey: 'seo.meta.description', name: 'meta description 存在', severity: 'warning', params: {} },
  { groupName: GROUP_SEO, ruleKey: 'seo.og.basic', name: 'OG 基础标签完整', severity: 'warning', params: { require: ['og:title', 'og:image', 'og:description'] } },
  { groupName: GROUP_SEO, ruleKey: 'seo.canonical', name: 'canonical 链接存在', severity: 'warning', params: {} },
  { groupName: GROUP_SEO, ruleKey: 'seo.robots.txt', name: 'robots.txt 可访问', severity: 'warning', params: {} },
  { groupName: GROUP_SEO, ruleKey: 'seo.sitemap.xml', name: 'sitemap.xml 可访问', severity: 'warning', params: {} },
  { groupName: GROUP_SEO, ruleKey: 'seo.h1.exists', name: '存在唯一 h1 标题', severity: 'warning', params: {} },

  // ── 性能 ──
  { groupName: GROUP_PERF, ruleKey: 'perf.ttfb', name: '首字节时间 TTFB', severity: 'warning', params: { passMs: 800, warnMs: 1500 } },
  { groupName: GROUP_PERF, ruleKey: 'perf.domcontentloaded', name: 'DOM 加载完成时间', severity: 'warning', params: { passMs: 2000, warnMs: 4000 } },
  { groupName: GROUP_PERF, ruleKey: 'perf.load', name: '完整加载时间', severity: 'warning', params: { passMs: 3000, warnMs: 6000 } },
  { groupName: GROUP_PERF, ruleKey: 'perf.total.size', name: '页面总传输大小', severity: 'warning', params: { passMb: 3, warnMb: 6 } },
  { groupName: GROUP_PERF, ruleKey: 'perf.lcp', name: 'LCP 最大内容绘制', severity: 'warning', params: { passMs: 2500, warnMs: 4000 } },

  // ── 安全 ──
  { groupName: GROUP_SECURITY, ruleKey: 'security.https', name: 'HTTPS 可用且证书有效', severity: 'critical', params: {} },
  { groupName: GROUP_SECURITY, ruleKey: 'security.cert.days', name: '证书剩余有效期', severity: 'warning', params: { passDays: 30, warnDays: 7 } },
  { groupName: GROUP_SECURITY, ruleKey: 'security.hsts', name: 'HSTS 响应头存在', severity: 'suggest', params: {} },
  { groupName: GROUP_SECURITY, ruleKey: 'security.security.headers', name: '基础安全响应头', severity: 'warning', params: { require: ['X-Frame-Options', 'X-Content-Type-Options', 'Referrer-Policy'] } },
  { groupName: GROUP_SECURITY, ruleKey: 'security.sensitive.info', name: '无敏感信息泄露', severity: 'critical', params: {} },
  { groupName: GROUP_SECURITY, ruleKey: 'security.mixed.content', name: '无混合内容（https 页无 http 资源）', severity: 'critical', params: {} },

  // ── 内容与可用性 ──
  { groupName: GROUP_CONTENT, ruleKey: 'content.charset', name: '页面编码为 UTF-8', severity: 'critical', params: {} },
  { groupName: GROUP_CONTENT, ruleKey: 'content.favicon', name: 'favicon 存在', severity: 'suggest', params: {} },
  { groupName: GROUP_CONTENT, ruleKey: 'content.viewport', name: '移动端 viewport 设置正确', severity: 'critical', params: {} },
  { groupName: GROUP_CONTENT, ruleKey: 'content.console.errors', name: '页面加载无未捕获 JS 错误', severity: 'warning', params: {} },
  { groupName: GROUP_CONTENT, ruleKey: 'content.404.friendly', name: '404 页面友好', severity: 'warning', params: {} },

  // ── 合规（按需启用）──
  { groupName: GROUP_COMPLIANCE, ruleKey: 'compliance.icp', name: 'ICP 备案号展示（中国大陆）', severity: 'warning', params: {} },
  { groupName: GROUP_COMPLIANCE, ruleKey: 'compliance.privacy', name: '隐私政策入口存在', severity: 'warning', params: {} },
  { groupName: GROUP_COMPLIANCE, ruleKey: 'compliance.copyright.year', name: '版权年份为当前年', severity: 'suggest', params: {} }
]

/** 建站服务合同验收规则：映射合同 8 大板块；verify.* 为人工交付项（待验收），其余由引擎自动检测 */
const contractRuleDefs: SeedRule[] = [
  // ── 网站规划 ──
  { groupName: GROUP_PLAN, ruleKey: 'verify.plan.cycle', name: '建站周期（4—6 周交付）', severity: 'warning' },
  { groupName: GROUP_PLAN, ruleKey: 'verify.plan.strategy', name: '网站建设规划（行业定位定制结构路径）', severity: 'warning' },
  { groupName: GROUP_PLAN, ruleKey: 'verify.plan.style', name: '精选样式库（品牌视觉 1 套模板）', severity: 'suggest' },

  // ── 网站建设 ──
  { groupName: GROUP_BUILD, ruleKey: 'verify.build.banner', name: 'Banner 创意设计（交付 3 张品牌视觉）', severity: 'suggest' },
  { groupName: GROUP_BUILD, ruleKey: 'verify.build.pages', name: '常规页面搭建（交付 10 个基础页面）', severity: 'warning' },
  { groupName: GROUP_BUILD, ruleKey: 'content.viewport', name: '响应式设计（移动端 viewport 正确）', severity: 'critical' },
  { groupName: GROUP_BUILD, ruleKey: 'contract.contact', name: '多转化入口（全局/页内询盘表单）', severity: 'warning' },
  { groupName: GROUP_BUILD, ruleKey: 'contract.search', name: '全站搜索功能内置可用', severity: 'warning' },
  { groupName: GROUP_BUILD, ruleKey: 'content.404.friendly', name: '自定义 404 页面友好', severity: 'warning' },
  { groupName: GROUP_BUILD, ruleKey: 'compliance.privacy', name: '隐私政策页（海外推广合规）', severity: 'warning' },
  { groupName: GROUP_BUILD, ruleKey: 'contract.gtranslate', name: 'Google 翻译插件（一键多语言）', severity: 'suggest' },
  { groupName: GROUP_BUILD, ruleKey: 'verify.build.thanks', name: '感谢页跳转跟踪已埋点', severity: 'suggest' },

  // ── 功能与优化 ──
  { groupName: GROUP_OPTIMIZE, ruleKey: 'contract.ga', name: 'GA 预埋（流量统计可追踪）', severity: 'warning' },
  { groupName: GROUP_OPTIMIZE, ruleKey: 'security.https', name: 'HTTPS 安全证书部署', severity: 'critical' },
  { groupName: GROUP_OPTIMIZE, ruleKey: 'security.cert.days', name: 'SSL 证书剩余有效期充足', severity: 'warning' },
  { groupName: GROUP_OPTIMIZE, ruleKey: 'security.security.headers', name: '基础安全响应头配置', severity: 'warning' },
  { groupName: GROUP_OPTIMIZE, ruleKey: 'seo.title.exists', name: 'SEO：title 标签存在且非空', severity: 'critical' },
  { groupName: GROUP_OPTIMIZE, ruleKey: 'seo.title.length', name: 'SEO：title 长度合理（≤60 字符）', severity: 'warning' },
  { groupName: GROUP_OPTIMIZE, ruleKey: 'seo.meta.description', name: 'SEO：meta description 存在', severity: 'warning' },
  { groupName: GROUP_OPTIMIZE, ruleKey: 'seo.canonical', name: 'SEO：canonical 链接存在', severity: 'warning' },
  { groupName: GROUP_OPTIMIZE, ruleKey: 'seo.robots.txt', name: 'SEO：robots.txt 可访问', severity: 'warning' },
  { groupName: GROUP_OPTIMIZE, ruleKey: 'seo.sitemap.xml', name: 'SEO：sitemap.xml 可访问', severity: 'warning' },
  { groupName: GROUP_OPTIMIZE, ruleKey: 'seo.h1.exists', name: 'SEO：唯一 h1 标题', severity: 'warning' },
  { groupName: GROUP_OPTIMIZE, ruleKey: 'verify.optimize.html', name: 'HTML 优化（URL/Title/H1/Alt/Meta 自定义）', severity: 'warning' },
  { groupName: GROUP_OPTIMIZE, ruleKey: 'verify.optimize.server', name: '基础 AWS 海外服务器（2vCPU/8GB/20GB）', severity: 'warning' },
  { groupName: GROUP_OPTIMIZE, ruleKey: 'verify.optimize.firewall', name: '免费版防火墙（CloudFlare/QUIC.cloud 1 年）', severity: 'suggest' },
  { groupName: GROUP_OPTIMIZE, ruleKey: 'verify.optimize.cdn', name: '安全与 CDN 加速服务（1 年）', severity: 'suggest' },

  // ── 后台管理 ──
  { groupName: GROUP_ADMIN, ruleKey: 'verify.admin.news', name: '新闻管理（批量/分类/图文编辑/回收）', severity: 'warning' },
  { groupName: GROUP_ADMIN, ruleKey: 'verify.admin.product', name: '产品管理（批量/分类/图文/回收）', severity: 'warning' },
  { groupName: GROUP_ADMIN, ruleKey: 'verify.admin.files', name: '多格式文件管理（上传/筛选/删除）', severity: 'suggest' },
  { groupName: GROUP_ADMIN, ruleKey: 'verify.admin.youtube', name: 'YouTube 视频嵌入', severity: 'suggest' },
  { groupName: GROUP_ADMIN, ruleKey: 'verify.admin.mail', name: '邮件管理（询盘查看/导出）', severity: 'suggest' },
  { groupName: GROUP_ADMIN, ruleKey: 'verify.admin.onboard', name: 'Onboard 智慧网站解决方案', severity: 'suggest' },

  // ── 图文内容 ──
  { groupName: GROUP_CONTENT_FILL, ruleKey: 'verify.content.fill', name: '图文填充（协助落地 10 页素材）', severity: 'warning' },
  { groupName: GROUP_CONTENT_FILL, ruleKey: 'verify.content.product', name: '产品代上传（1—5 个）', severity: 'suggest' },
  { groupName: GROUP_CONTENT_FILL, ruleKey: 'verify.content.blog', name: '博文代上传（1—4 篇）', severity: 'suggest' },

  // ── 售后支持 ──
  { groupName: GROUP_SUPPORT, ruleKey: 'verify.support.inspection', name: '网站日常巡检', severity: 'warning' },
  { groupName: GROUP_SUPPORT, ruleKey: 'verify.support.bugfix', name: '紧急 Bug 修复', severity: 'warning' },
  { groupName: GROUP_SUPPORT, ruleKey: 'verify.support.perf', name: '性能与安全优化（CDN/缓存/数据库/备份）', severity: 'warning' },
  { groupName: GROUP_SUPPORT, ruleKey: 'verify.support.ssl', name: 'SSL 证书全生命周期管理', severity: 'warning' },
  { groupName: GROUP_SUPPORT, ruleKey: 'verify.support.security', name: '安全防护与巡检（漏洞扫描）', severity: 'warning' },
  { groupName: GROUP_SUPPORT, ruleKey: 'verify.support.training', name: '后台培训与操作手册（1 份）', severity: 'suggest' },
  { groupName: GROUP_SUPPORT, ruleKey: 'verify.support.content', name: '上线内容技术支持', severity: 'suggest' },
  { groupName: GROUP_SUPPORT, ruleKey: 'verify.support.rollback', name: '免费数据回滚一次', severity: 'suggest' },
  { groupName: GROUP_SUPPORT, ruleKey: 'verify.support.source', name: '免费提供源代码（1 次）', severity: 'suggest' },
]

/** 内置规则集定义 */
export interface BuiltinRuleSetDef {
  name: string
  description: string
  rules: SeedRule[]
}

export const BUILTIN_RULE_SETS: BuiltinRuleSetDef[] = [
  {
    name: '默认合规检查（全面）',
    description: '内置默认规则集：覆盖 SEO、性能、安全、内容可用性与合规维度，适用于网站上线前全面检查。',
    rules: seedRules
  },
  {
    name: '建站服务合同验收',
    description: '按建站服务合同 6 大板块（网站规划/网站建设/功能与优化/后台管理/图文内容/售后支持）逐项验收；可自动检测项由浏览器引擎验证，人工交付项标记为「待验收」。',
    rules: contractRuleDefs
  },
  {
    name: '快速安全检查',
    description: '仅包含安全与基础可用性规则，检测耗时短，适合快速初筛。',
    rules: seedRules.filter((r) => [GROUP_SECURITY, GROUP_CONTENT].includes(r.groupName))
  }
]

/** 将种子规则转换为规则行（带默认参数与自增 id） */
export function toRuleRows(
  ruleSetId: number,
  rules: SeedRule[],
  startId: number
): {
  id: number
  ruleSetId: number
  groupName: string
  ruleKey: string
  name: string
  severity: Severity
  enabled: boolean
  params: Record<string, unknown>
  sortOrder: number
}[] {
  return rules.map((r, idx) => ({
    id: startId + idx,
    ruleSetId,
    groupName: r.groupName,
    ruleKey: r.ruleKey,
    name: r.name,
    severity: r.severity,
    enabled: true,
    params: r.params ?? {},
    sortOrder: idx
  }))
}

/** 可添加的规则目录：从内置种子规则去重生成（供 UI 添加规则用） */
export function getRuleCatalog(): {
  groupName: string
  ruleKey: string
  name: string
  severity: Severity
  params: Record<string, unknown>
}[] {
  const seen = new Set<string>()
  const catalog: {
    groupName: string
    ruleKey: string
    name: string
    severity: Severity
    params: Record<string, unknown>
  }[] = []
  for (const def of BUILTIN_RULE_SETS) {
    for (const seed of def.rules) {
      if (seen.has(seed.ruleKey)) continue
      seen.add(seed.ruleKey)
      catalog.push({
        groupName: seed.groupName,
        ruleKey: seed.ruleKey,
        name: seed.name,
        severity: seed.severity,
        params: seed.params ?? {}
      })
    }
  }
  return catalog
}
