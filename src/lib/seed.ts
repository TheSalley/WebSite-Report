
/** 内置规则集种子数据：建站服务合同验收 */

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
  description?: string
  params?: Record<string, unknown>
}

/** 建站服务合同验收规则：映射合同 8 大板块；verify.* 为人工交付项（待验收），其余由引擎自动检测 */
const contractRuleDefs: SeedRule[] = [
  // ── 网站规划 ──
  { groupName: GROUP_PLAN, ruleKey: 'verify.plan.cycle', name: '建站周期（4—6 周交付）', description: '4—6 周' },
  { groupName: GROUP_PLAN, ruleKey: 'verify.plan.strategy', name: '网站建设规划（行业定位定制结构路径）', description: '基于行业特性与品牌定位，量身定制网站结构与用户体验路径，助力高效转化' },
  { groupName: GROUP_PLAN, ruleKey: 'verify.plan.style', name: '精选样式库（品牌视觉 1 套模板）', description: '精选一站式样式库，打造独特品牌视觉风格' },

  // ── 网站建设 ──
  { groupName: GROUP_BUILD, ruleKey: 'verify.build.banner', name: 'Banner 创意设计（交付 3 张品牌视觉）', description: '由专业设计师操刀，融合品牌调性，提升首页视觉冲击力与用户停留时长' },
  { groupName: GROUP_BUILD, ruleKey: 'verify.build.pages', name: '常规页面搭建（交付 10 个基础页面）', description: '搭建首页、产品、博客等10个标准样式页面，覆盖业务全场景' },
  { groupName: GROUP_BUILD, ruleKey: 'content.viewport', name: '响应式设计（移动端 viewport 正确）', description: '全设备自适应，确保手机、电脑浏览体验一致流畅' },
  { groupName: GROUP_BUILD, ruleKey: 'contract.contact', name: '多转化入口（全局/页内询盘表单）', description: '设置全局与页面内询盘表单，提升转化率', params: { defaultPass: true } },
  { groupName: GROUP_BUILD, ruleKey: 'contract.search', name: '全站搜索功能内置可用', description: '内置搜索框，便于用户迅速检索定位站内内容' },
  { groupName: GROUP_BUILD, ruleKey: 'compliance.privacy', name: '隐私政策页（海外推广合规）', description: '配置隐私政策页，符合海外推广合规要求' },
  { groupName: GROUP_BUILD, ruleKey: 'contract.gtranslate', name: 'Google 翻译插件（一键多语言）', description: '免费提供Google内嵌翻译插件，一键实现多语言建站' },
  { groupName: GROUP_BUILD, ruleKey: 'verify.build.thanks', name: '感谢页跳转跟踪已埋点', description: '精准跟踪转化行为，减少统计误差' },

  // ── 功能与优化 ──
  { groupName: GROUP_OPTIMIZE, ruleKey: 'contract.ga', name: 'GA 预埋（流量统计可追踪）', description: '后台一键导入Google Analytics代码，便于数据跟踪' },
  { groupName: GROUP_OPTIMIZE, ruleKey: 'security.https', name: 'HTTPS 安全证书部署', description: '部署SSL证书，支持HTTPS协议，提升网站安全性', params: { defaultPass: true } },
  { groupName: GROUP_OPTIMIZE, ruleKey: 'seo.title.exists', name: 'SEO：title 标签存在且非空', description: '提供一站式智能优化组件，覆盖站内SEO核心环节，有效提升网站在搜索引擎中的收录效率与排名表现' },
  { groupName: GROUP_OPTIMIZE, ruleKey: 'seo.meta.description', name: 'SEO：meta description 存在', description: '提供一站式智能优化组件，覆盖站内SEO核心环节，有效提升网站在搜索引擎中的收录效率与排名表现' },
  { groupName: GROUP_OPTIMIZE, ruleKey: 'seo.robots.txt', name: 'SEO：robots.txt 可访问', description: '提供一站式智能优化组件，覆盖站内SEO核心环节，有效提升网站在搜索引擎中的收录效率与排名表现' },
  { groupName: GROUP_OPTIMIZE, ruleKey: 'seo.sitemap.xml', name: 'SEO：sitemap.xml 可访问', description: '提供一站式智能优化组件，覆盖站内SEO核心环节，有效提升网站在搜索引擎中的收录效率与排名表现' },
  { groupName: GROUP_OPTIMIZE, ruleKey: 'seo.h1.exists', name: 'SEO：唯一 h1 标题', description: '提供一站式智能优化组件，覆盖站内SEO核心环节，有效提升网站在搜索引擎中的收录效率与排名表现' },
  { groupName: GROUP_OPTIMIZE, ruleKey: 'verify.optimize.html', name: 'HTML 优化（URL/Title/H1/Alt/Meta 自定义）', description: '支持自定义URL、Title、H1、图片Alt和Meta描述' },
  { groupName: GROUP_OPTIMIZE, ruleKey: 'verify.optimize.server', name: '基础 AWS 海外服务器（2vCPU/8GB/20GB）', description: '配置2vCPU+8GB内存+20GB空间，支持最多100个产品' },
  { groupName: GROUP_OPTIMIZE, ruleKey: 'verify.optimize.firewall', name: '免费版防火墙（CloudFlare/QUIC.cloud 1 年）', description: 'CloudFlare或QUIC.cloud免费防火墙，有效过滤恶意流量与网络攻击，为网站提供基础而可靠的安全防护' },
  { groupName: GROUP_OPTIMIZE, ruleKey: 'verify.optimize.cdn', name: '安全与 CDN 加速服务（1 年）', description: '提供免费版CloudFlare或QUIC.cloud防护与CDN加速服务，提升访问速度与安全' },

  // ── 后台管理 ──
  { groupName: GROUP_ADMIN, ruleKey: 'verify.admin.news', name: '新闻管理（批量/分类/图文编辑/回收）', description: '批量上传功能\n新闻分类功能\n图文自由编辑排版\n一键快速编辑修改\n自定义设置发布日期\n回收恢复已删除新闻，数据可逆', params: { defaultPass: true } },
  { groupName: GROUP_ADMIN, ruleKey: 'verify.admin.product', name: '产品管理（批量/分类/图文/回收）', description: '批量上传功能\n产品分类功能\n一键快速编辑修改\n支持产品的图片加文字信息上传\n回收恢复已删除产品，数据可逆' },
  { groupName: GROUP_ADMIN, ruleKey: 'verify.admin.files', name: '多格式文件管理（上传/筛选/删除）', description: '支持不同格式的媒体文件进行上传、筛选、删除，方便统一管理' },
  { groupName: GROUP_ADMIN, ruleKey: 'verify.admin.youtube', name: 'YouTube 视频嵌入', description: '支持Youtube视频无缝嵌入网站，丰富内容形式，延长访客停留时间，提升网站转化率与品牌专业度' },
  { groupName: GROUP_ADMIN, ruleKey: 'verify.admin.mail', name: '邮件管理（询盘查看/导出）', description: '后台查看导出询盘数据' },
  { groupName: GROUP_ADMIN, ruleKey: 'verify.admin.onboard', name: 'Onboard 智慧网站解决方案', description: '集成AI策略与多平台社媒嵌入，一站式管理' },

  // ── 图文内容 ──
  { groupName: GROUP_CONTENT_FILL, ruleKey: 'verify.content.fill', name: '图文填充（协助落地 10 页素材）', description: '基于行业特性与营销策略，提供素材规格说明，协助上传落地10个已搭建页面的图文素材' },
  { groupName: GROUP_CONTENT_FILL, ruleKey: 'verify.content.product', name: '产品代上传（1—5 个）', description: '专业产品信息整理与人工上传服务，包括标题、描述、图片优化，提升产品吸引力' },
  { groupName: GROUP_CONTENT_FILL, ruleKey: 'verify.content.blog', name: '博文代上传（1—4 篇）', description: '支持品牌故事、行业洞察、公司动态等内容的新闻/Blog人工上传，增强SEO与用户粘性' },

  // ── 售后支持 ──
  { groupName: GROUP_SUPPORT, ruleKey: 'verify.support.inspection', name: '网站日常巡检', description: '定期对网站运行状态、核心页面链接及加载速度进行系统性检查' },
  { groupName: GROUP_SUPPORT, ruleKey: 'verify.support.bugfix', name: '紧急 Bug 修复', description: '快速响应并修复网站功能异常、显示问题等紧急故障，保障稳定运行' },
  { groupName: GROUP_SUPPORT, ruleKey: 'verify.support.perf', name: '性能与安全优化（CDN/缓存/数据库/备份）', description: '包含CDN加速、缓存优化、数据库调优、SSL证书管理与定期备份，提升速度与安全' },
  { groupName: GROUP_SUPPORT, ruleKey: 'verify.support.ssl', name: 'SSL 证书全生命周期管理', description: '服务期内，支持SSL证书的全权维护，确保证书持续有效，在浏览器中始终显示安全锁标识' },
  { groupName: GROUP_SUPPORT, ruleKey: 'verify.support.security', name: '安全防护与巡检（漏洞扫描）', description: '定期漏洞扫描与网站健康检查，防范网络攻击' },
  { groupName: GROUP_SUPPORT, ruleKey: 'verify.support.training', name: '后台培训与操作手册（1 份）', description: '提供详细图文操作手册，帮助快速掌握后台管理' },
  { groupName: GROUP_SUPPORT, ruleKey: 'verify.support.content', name: '上线内容技术支持', description: '对上线交付范围内网站内容修改进行指导' },
  { groupName: GROUP_SUPPORT, ruleKey: 'verify.support.rollback', name: '免费数据回滚一次', description: '免费提供一次网站故障或数据异常时恢复至之前备份版本的服务' },
  { groupName: GROUP_SUPPORT, ruleKey: 'verify.support.source', name: '免费提供源代码（1 次）', description: '网站上线后免费打包移交源码一次，不含部署' },
]

/** 内置规则集定义 */
export interface BuiltinRuleSetDef {
  name: string
  description: string
  rules: SeedRule[]
}

export const BUILTIN_RULE_SETS: BuiltinRuleSetDef[] = [
  {
    name: '建站服务合同验收',
    description: "按建站服务合同 6 大板块（网站规划/网站建设/功能与优化/后台管理/图文内容/售后支持）逐项验收；可自动检测项由浏览器引擎验证，人工交付项标记为「待验收」。",
    rules: contractRuleDefs
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
  enabled: boolean
  description?: string
  params: Record<string, unknown>
  sortOrder: number
}[] {
  return rules.map((r, idx) => ({
    id: startId + idx,
    ruleSetId,
    groupName: r.groupName,
    ruleKey: r.ruleKey,
    name: r.name,
    enabled: true,
    description: r.description,
    params: r.params ?? {},
    sortOrder: idx
  }))
}

/** 可添加的规则目录：从内置种子规则去重生成（供 UI 添加规则用） */
export function getRuleCatalog(): {
  groupName: string
  ruleKey: string
  name: string
  description?: string
  params: Record<string, unknown>
}[] {
  const seen = new Set<string>()
  const catalog: {
    groupName: string
    ruleKey: string
    name: string
    description?: string
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
        description: seed.description,
        params: seed.params ?? {}
      })
    }
  }
  return catalog
}
