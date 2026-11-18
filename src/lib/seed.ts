
/** 内置规则集种子数据：建站服务合同验收 + 网站交付检查 */

const GROUP_PLAN = '网站规划'
const GROUP_BUILD = '网站建设'
const GROUP_OPTIMIZE = '功能与优化'
const GROUP_ADMIN = '后台管理'
const GROUP_CONTENT_FILL = '图文内容'
const GROUP_DELIVERY_PAGE = '页面基础'
const GROUP_DELIVERY_ELEMENTOR = 'Elementor 板块'
const GROUP_DELIVERY_SITE = '站点基础'

interface SeedRule {
  groupName: string
  ruleKey: string
  name: string
  description?: string
  /** 交付成果文案（可留空，自动用预设） */
  deliverable?: string
  /** 执行范围：'site' 站点级（整站仅执行一次）| 'page' 页面级（默认） */
  scope?: 'page' | 'site'
  /** 规则类型：check 机器检测 | deliverable 合同文案 | artifact 功能产物 */
  kind?: 'check' | 'deliverable' | 'artifact'
  params?: Record<string, unknown>
}

/** 建站服务合同验收规则：严格对应合同文案示例（5 大板块 / 25 项 + PageSpeed 截图产物） */
const contractRuleDefs: SeedRule[] = [
  // ── 网站规划（2 项）──
  {
    groupName: GROUP_PLAN,
    ruleKey: 'verify.plan.strategy',
    name: '网站建设规划',
    description: '基于行业特性与品牌定位，量身定制网站结构与用户体验路径，助力高效转化',
    deliverable: '✅',
    kind: 'deliverable'
  },
  {
    groupName: GROUP_PLAN,
    ruleKey: 'verify.plan.style',
    name: '精选样式库',
    description: '精选一站式样式库，打造独特品牌视觉风格',
    deliverable: '✅',
    kind: 'deliverable'
  },

  // ── 网站建设（8 项）──
  {
    groupName: GROUP_BUILD,
    ruleKey: 'verify.build.banner',
    name: 'Banner 创意设计',
    description: '由专业设计师操刀，融合品牌调性，提升首页视觉冲击力与用户停留时长',
    deliverable: '✅',
    kind: 'deliverable'
  },
  {
    groupName: GROUP_BUILD,
    ruleKey: 'verify.build.pages',
    name: '常规页面搭建',
    description: '搭建首页、产品、博客等10个标准样式页面，覆盖业务全场景',
    deliverable: '10个',
    kind: 'deliverable'
  },
  {
    groupName: GROUP_BUILD,
    ruleKey: 'content.viewport',
    name: '响应式设计',
    description: '全设备自适应，确保手机、电脑浏览体验一致流畅',
    deliverable: '✅',
    kind: 'deliverable'
  },
  {
    groupName: GROUP_BUILD,
    ruleKey: 'contract.contact',
    name: '多转化入口',
    description: '设置全局与页面内询盘表单，提升转化率',
    deliverable: '✅',
    kind: 'deliverable'
  },
  {
    groupName: GROUP_BUILD,
    ruleKey: 'contract.search',
    name: '全站搜索功能',
    description: '内置搜索框，便于用户迅速检索定位站内内容',
    deliverable: '✅',
    kind: 'deliverable'
  },
  {
    groupName: GROUP_BUILD,
    ruleKey: 'compliance.privacy',
    name: '隐私政策页',
    description: '配置隐私政策页，符合海外推广合规要求',
    deliverable: '✅',
    kind: 'deliverable'
  },
  {
    groupName: GROUP_BUILD,
    ruleKey: 'contract.gtranslate',
    name: 'Google 翻译插件',
    description: '免费提供 Google 内嵌翻译插件，支持切换多语言，提升海外用户体验',
    deliverable: '✅',
    kind: 'check'
  },
  {
    groupName: GROUP_BUILD,
    ruleKey: 'verify.build.thanks',
    name: '感谢页跳转跟踪',
    description: '精准跟踪转化行为，减少统计误差',
    deliverable: '✅',
    kind: 'deliverable'
  },

  // ── 功能与优化（6 项）──
  {
    groupName: GROUP_OPTIMIZE,
    ruleKey: 'contract.ga',
    name: 'GA 预埋',
    description: '后台支持设置Google Analytics 代码，便于数据跟踪',
    deliverable: '✅',
    kind: 'deliverable'
  },
  {
    groupName: GROUP_OPTIMIZE,
    ruleKey: 'security.https',
    name: 'HTTPS 安全证书部署',
    description: '部署SSL证书，支持HTTPS协议，提升网站安全性',
    deliverable: '✅',
    kind: 'deliverable'
  },
  {
    groupName: GROUP_OPTIMIZE,
    ruleKey: 'verify.optimize.html',
    name: 'HTML 优化',
    description: '支持自定义URL、Title、H1、图片Alt',
    deliverable: '✅',
    kind: 'deliverable'
  },
  {
    groupName: GROUP_OPTIMIZE,
    ruleKey: 'verify.optimize.server',
    name: '基础AWS 海外服务器',
    description: '配置2vCPU+8GB内存+20GB空间，支持最多100个产品',
    deliverable: '✅',
    kind: 'deliverable'
  },
  {
    groupName: GROUP_OPTIMIZE,
    ruleKey: 'verify.optimize.firewall',
    name: '免费版防火墙',
    description: 'CloudFlare或QUIC.cloud免费防火墙，有效过滤恶意流量与网络攻击，为网站提供基础而可靠的安全防护',
    deliverable: '1 年',
    kind: 'deliverable'
  },
  {
    groupName: GROUP_OPTIMIZE,
    ruleKey: 'verify.optimize.cdn',
    name: '安全与CDN 加速服务',
    description: '提供免费版CloudFlare或QUIC.cloud防护与CDN加速服务，提升访问速度与安全',
    deliverable: '1 年',
    kind: 'deliverable'
  },

  // ── 后台管理（6 项）──
  {
    groupName: GROUP_ADMIN,
    ruleKey: 'verify.admin.news',
    name: '新闻管理',
    description: '批量上传功能 新闻分类功能 图文自由编辑排版 一键快速编辑修改 自定义设置发布日期 回收恢复已删除新闻，数据可逆',
    deliverable: '✅',
    kind: 'deliverable'
  },
  {
    groupName: GROUP_ADMIN,
    ruleKey: 'verify.admin.product',
    name: '产品管理',
    description: '批量上传功能 产品分类功能 一键快速编辑修改 支持产品的图片加文字信息上传 回收恢复已删除产品，数据可逆',
    deliverable: '✅',
    kind: 'deliverable'
  },
  {
    groupName: GROUP_ADMIN,
    ruleKey: 'verify.admin.files',
    name: '多格式文件管理',
    description: '支持不同格式的媒体文件进行上传、筛选、删除，方便统一管理',
    deliverable: '✅',
    kind: 'deliverable'
  },
  {
    groupName: GROUP_ADMIN,
    ruleKey: 'verify.admin.youtube',
    name: 'YouTube 视频嵌入',
    description: '支持Youtube视频无缝嵌入网站，丰富内容形式，延长访客停留时间，提升网站转化率与品牌专业度',
    deliverable: '✅',
    kind: 'deliverable'
  },
  {
    groupName: GROUP_ADMIN,
    ruleKey: 'verify.admin.mail',
    name: '询盘管理',
    description: '后台查看导出询盘数据',
    deliverable: '✅',
    kind: 'deliverable'
  },
  {
    groupName: GROUP_ADMIN,
    ruleKey: 'verify.admin.onboard',
    name: 'Onboard 智慧网站解决方案',
    description: '集成AI策略与多平台社媒嵌入，一站式管理',
    deliverable: '✅',
    kind: 'deliverable'
  },

  // ── 图文内容（3 项）──
  {
    groupName: GROUP_CONTENT_FILL,
    ruleKey: 'verify.content.fill',
    name: '图文填充',
    description: '基于行业特性与营销策略，提供素材规格说明，协助上传落地10个已搭建页面的图文素材',
    deliverable: '✅',
    kind: 'deliverable'
  },
  {
    groupName: GROUP_CONTENT_FILL,
    ruleKey: 'verify.content.product',
    name: '产品代上传',
    description: '专业产品信息整理与人工上传服务，包括标题、描述、图片优化，提升产品吸引力',
    deliverable: '7个',
    kind: 'deliverable'
  },
  {
    groupName: GROUP_CONTENT_FILL,
    ruleKey: 'verify.content.blog',
    name: '新闻代上传',
    description: '支持品牌故事、行业洞察、公司动态等内容的新闻/Blog人工上传，增强SEO与用户粘性',
    deliverable: '3个',
    kind: 'deliverable'
  },

  // ── 功能产物（不进入合同明细表）──
  {
    groupName: GROUP_OPTIMIZE,
    ruleKey: 'artifact.pagespeed.shots',
    name: 'PageSpeed 得分截图',
    description: '保存 pagespeed.web.dev 得分报告截图，作为报告中的性能证据；仅生成截图，不改变规则通过状态',
    kind: 'artifact'
  }
]

/** 网站交付检查规则：交付前质量检查，全部由机器检测 */
const deliveryRuleDefs: SeedRule[] = [
  { groupName: GROUP_DELIVERY_SITE, ruleKey: 'delivery.sitemap', name: 'Sitemap 检查', scope: 'site' },
  { groupName: GROUP_DELIVERY_PAGE, ruleKey: 'delivery.h1.count', name: 'H1 标签检查', scope: 'site' },
  { groupName: GROUP_DELIVERY_ELEMENTOR, ruleKey: 'delivery.elementor.hidden-both', name: 'Elementor 隐藏板块检查', scope: 'site' },
  {
    groupName: GROUP_DELIVERY_PAGE,
    ruleKey: 'seo.noindex.disabled',
    name: 'No-Index 检查',
    scope: 'site'
  },
  {
    groupName: GROUP_DELIVERY_PAGE,
    ruleKey: 'seo.site.title-favicon',
    name: '站点 Title / Favicon 检查（首页）',
    scope: 'site'
  }
]
/** 内置规则集定义 */
export interface BuiltinRuleSetDef {
  name: string
  description: string
  /** 多页面模板检查：网站交付检查专属（内置默认开启）；建站服务合同验收不启用（内置固定关闭，init 时与 DB 对齐） */
  scanPages?: boolean
  rules: SeedRule[]
}

export const BUILTIN_RULE_SETS: BuiltinRuleSetDef[] = [
  {
    name: '建站服务合同验收',
    description: '按建站服务合同 5 大板块（网站规划/网站建设/功能与优化/后台管理/图文内容）逐项验收；可机器检测项由浏览器引擎验证，合同文案标记为「待验收」，由人工确认。',
    scanPages: false,
    rules: contractRuleDefs
  },
  {
    name: '网站交付检查',
    description: '网站交付前的质量检查：验证 H1 标题存在且唯一，检查首页站点 Title / Favicon 与全站 No-Index，扫描 Elementor 板块是否残留同时隐藏于桌面与移动端的元素；H1、No-Index 与隐藏板块按 wp-sitemap.xml 的页面/新闻/产品链接逐页检查，其他页面级规则按模板去重取代表页。',
    scanPages: true,
    rules: deliveryRuleDefs
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
  deliverable?: string
  scope: 'page' | 'site'
  kind: 'check' | 'deliverable' | 'artifact'
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
    deliverable: r.deliverable && r.deliverable.trim() ? r.deliverable : DELIVERABLE_PRESETS[r.ruleKey] ?? '',
    scope: r.scope ?? 'page',
    kind: r.kind ?? (r.ruleKey.startsWith('verify.') ? 'deliverable' : r.ruleKey.startsWith('artifact.') ? 'artifact' : 'check'),
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
  deliverable?: string
  scope?: 'page' | 'site'
  kind?: 'check' | 'deliverable' | 'artifact'
  params: Record<string, unknown>
}[] {
  const seen = new Set<string>()
  const catalog: {
    groupName: string
    ruleKey: string
    name: string
    description?: string
    deliverable?: string
    scope?: 'page' | 'site'
    kind?: 'check' | 'deliverable' | 'artifact'
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
        deliverable: seed.deliverable && seed.deliverable.trim() ? seed.deliverable : DELIVERABLE_PRESETS[seed.ruleKey] ?? '',
        scope: seed.scope ?? 'page',
        kind: seed.kind ?? (seed.ruleKey.startsWith('verify.') ? 'deliverable' : 'check'),
        params: seed.params ?? {}
      })
    }
  }
  return catalog
}

/** 合同报告固定条目：严格对齐示例 PDF 的板块、顺序、名称、说明与交付成果 */
export const CONTRACT_REPORT_ITEMS: ReadonlyArray<{
  groupName: string
  ruleKey: string
  name: string
  description: string
  deliverable: string
}> = [
  {
    groupName: GROUP_PLAN,
    ruleKey: 'verify.plan.strategy',
    name: '网站建设规划',
    description: '基于行业特性与品牌定位，量身定制网站结构与用户体验路径，助力高效转化',
    deliverable: '✅'
  },
  {
    groupName: GROUP_PLAN,
    ruleKey: 'verify.plan.style',
    name: '精选样式库',
    description: '精选一站式样式库，打造独特品牌视觉风格',
    deliverable: '✅'
  },
  {
    groupName: GROUP_BUILD,
    ruleKey: 'verify.build.banner',
    name: 'Banner 创意设计',
    description: '由专业设计师操刀，融合品牌调性，提升首页视觉冲击力与用户停留时长',
    deliverable: '✅'
  },
  {
    groupName: GROUP_BUILD,
    ruleKey: 'verify.build.pages',
    name: '常规页面搭建',
    description: '搭建首页、产品、博客等10个标准样式页面，覆盖业务全场景',
    deliverable: '10个'
  },
  {
    groupName: GROUP_BUILD,
    ruleKey: 'content.viewport',
    name: '响应式设计',
    description: '全设备自适应，确保手机、电脑浏览体验一致流畅',
    deliverable: '✅'
  },
  {
    groupName: GROUP_BUILD,
    ruleKey: 'contract.contact',
    name: '多转化入口',
    description: '设置全局与页面内询盘表单，提升转化率',
    deliverable: '✅'
  },
  {
    groupName: GROUP_BUILD,
    ruleKey: 'contract.search',
    name: '全站搜索功能',
    description: '内置搜索框，便于用户迅速检索定位站内内容',
    deliverable: '✅'
  },
  {
    groupName: GROUP_BUILD,
    ruleKey: 'compliance.privacy',
    name: '隐私政策页',
    description: '配置隐私政策页，符合海外推广合规要求',
    deliverable: '✅'
  },
  {
    groupName: GROUP_BUILD,
    ruleKey: 'contract.gtranslate',
    name: 'Google 翻译插件',
    description: '免费提供 Google 内嵌翻译插件，支持切换多语言，提升海外用户体验',
    deliverable: '✅'
  },
  {
    groupName: GROUP_BUILD,
    ruleKey: 'verify.build.thanks',
    name: '感谢页跳转跟踪',
    description: '精准跟踪转化行为，减少统计误差',
    deliverable: '✅'
  },
  {
    groupName: GROUP_OPTIMIZE,
    ruleKey: 'contract.ga',
    name: 'GA 预埋',
    description: '后台支持设置Google Analytics 代码，便于数据跟踪',
    deliverable: '✅'
  },
  {
    groupName: GROUP_OPTIMIZE,
    ruleKey: 'security.https',
    name: 'HTTPS 安全证书部署',
    description: '部署SSL证书，支持HTTPS协议，提升网站安全性',
    deliverable: '✅'
  },
  {
    groupName: GROUP_OPTIMIZE,
    ruleKey: 'verify.optimize.html',
    name: 'HTML 优化',
    description: '支持自定义URL、Title、H1、图片Alt',
    deliverable: '✅'
  },
  {
    groupName: GROUP_OPTIMIZE,
    ruleKey: 'verify.optimize.server',
    name: '基础AWS 海外服务器',
    description: '配置2vCPU+8GB内存+20GB空间，支持最多100个产品',
    deliverable: '✅'
  },
  {
    groupName: GROUP_OPTIMIZE,
    ruleKey: 'verify.optimize.firewall',
    name: '免费版防火墙',
    description: 'CloudFlare或QUIC.cloud免费防火墙，有效过滤恶意流量与网络攻击，为网站提供基础而可靠的安全防护',
    deliverable: '1 年'
  },
  {
    groupName: GROUP_OPTIMIZE,
    ruleKey: 'verify.optimize.cdn',
    name: '安全与CDN 加速服务',
    description: '提供免费版CloudFlare或QUIC.cloud防护与CDN加速服务，提升访问速度与安全',
    deliverable: '1 年'
  },
  {
    groupName: GROUP_ADMIN,
    ruleKey: 'verify.admin.news',
    name: '新闻管理',
    description: '批量上传功能 新闻分类功能 图文自由编辑排版 一键快速编辑修改 自定义设置发布日期 回收恢复已删除新闻，数据可逆',
    deliverable: '✅'
  },
  {
    groupName: GROUP_ADMIN,
    ruleKey: 'verify.admin.product',
    name: '产品管理',
    description: '批量上传功能 产品分类功能 一键快速编辑修改 支持产品的图片加文字信息上传 回收恢复已删除产品，数据可逆',
    deliverable: '✅'
  },
  {
    groupName: GROUP_ADMIN,
    ruleKey: 'verify.admin.files',
    name: '多格式文件管理',
    description: '支持不同格式的媒体文件进行上传、筛选、删除，方便统一管理',
    deliverable: '✅'
  },
  {
    groupName: GROUP_ADMIN,
    ruleKey: 'verify.admin.youtube',
    name: 'YouTube 视频嵌入',
    description: '支持Youtube视频无缝嵌入网站，丰富内容形式，延长访客停留时间，提升网站转化率与品牌专业度',
    deliverable: '✅'
  },
  {
    groupName: GROUP_ADMIN,
    ruleKey: 'verify.admin.mail',
    name: '询盘管理',
    description: '后台查看导出询盘数据',
    deliverable: '✅'
  },
  {
    groupName: GROUP_ADMIN,
    ruleKey: 'verify.admin.onboard',
    name: 'Onboard 智慧网站解决方案',
    description: '集成AI策略与多平台社媒嵌入，一站式管理',
    deliverable: '✅'
  },
  {
    groupName: GROUP_CONTENT_FILL,
    ruleKey: 'verify.content.fill',
    name: '图文填充',
    description: '基于行业特性与营销策略，提供素材规格说明，协助上传落地10个已搭建页面的图文素材',
    deliverable: '✅'
  },
  {
    groupName: GROUP_CONTENT_FILL,
    ruleKey: 'verify.content.product',
    name: '产品代上传',
    description: '专业产品信息整理与人工上传服务，包括标题、描述、图片优化，提升产品吸引力',
    deliverable: '7个'
  },
  {
    groupName: GROUP_CONTENT_FILL,
    ruleKey: 'verify.content.blog',
    name: '新闻代上传',
    description: '支持品牌故事、行业洞察、公司动态等内容的新闻/Blog人工上传，增强SEO与用户粘性',
    deliverable: '3个'
  }
]


/** 预设交付成果文案：按规则 key 提供默认「交付成果」，规则页可覆盖 */
export const DELIVERABLE_PRESETS: Record<string, string> = {
  'verify.plan.cycle': '交付建站周期排期表：4—6 周按里程碑推进',
  'verify.plan.strategy': '交付《网站建设规划方案》：行业定位 + 定制结构路径',
  'verify.plan.style': '交付精选样式库与品牌视觉模板 1 套',
  'verify.build.banner': '交付 Banner 创意设计 3 张品牌视觉图',
  'verify.build.pages': '交付 10 个基础标准页面',
  'content.viewport': '移动端 viewport 配置正确，全设备自适应',
  'contract.contact': '已部署全局/页内询盘表单',
  'contract.search': '已内置全站搜索功能',
  'compliance.privacy': '已配置隐私政策页',
  'contract.gtranslate': '已嵌入 Google 翻译插件',
  'verify.build.thanks': '感谢页跳转跟踪已埋点',
  'contract.ga': 'GA 代码已预埋，流量可追踪',
  'security.https': 'HTTPS 证书已部署',
  'seo.title.exists': 'Title 标签已配置',
  'seo.meta.description': 'Meta Description 已配置',
  'seo.robots.txt': 'robots.txt 可正常访问',
  'seo.sitemap.xml': '站点地图可正常访问（含页面/新闻/产品）',
  'seo.noindex.disabled': 'No-Index 已关闭，页面可正常被搜索引擎收录',
  'seo.site.title-favicon': '首页站点 Title 与 Favicon 已配置',
  'seo.h1.exists': 'H1 标题唯一且已配置',
  'verify.optimize.html': 'URL/Title/H1/Alt/Meta 已完成自定义优化',
  'verify.optimize.server': 'AWS 海外服务器已交付（2vCPU/8GB/20GB）',
  'verify.optimize.firewall': '免费版防火墙已开通（CloudFlare/QUIC.cloud 1 年）',
  'verify.optimize.cdn': 'CDN 与安全加速服务已启用（1 年）',
  'verify.admin.news': '新闻管理后台已交付（批量/分类/图文编辑/回收）',
  'verify.admin.product': '产品管理后台已交付（批量/分类/图文/回收）',
  'verify.admin.files': '多格式文件管理功能已交付',
  'verify.admin.youtube': 'YouTube 视频嵌入功能已交付',
  'verify.admin.mail': '邮件管理已开通（询盘查看/导出）',
  'verify.admin.onboard': 'Onboard 智慧网站解决方案已集成',
  'verify.content.fill': '已协助落地 10 页图文素材',
  'verify.content.product': '已完成产品代上传 1—5 个',
  'verify.content.blog': '已完成博文代上传 1—4 篇',
  'verify.support.inspection': '提供网站日常巡检服务',
  'verify.support.bugfix': '提供紧急 Bug 修复服务',
  'verify.support.perf': '提供性能与安全优化服务',
  'verify.support.ssl': '提供 SSL 证书全生命周期管理',
  'verify.support.security': '提供安全防护与漏洞扫描巡检',
  'verify.support.training': '已交付后台培训与操作手册 1 份',
  'verify.support.content': '提供上线内容技术支持',
  'verify.support.rollback': '提供免费数据回滚 1 次',
  'verify.support.source': '提供免费源代码移交 1 次',
  'delivery.sitemap': '已配置站点地图（wp-sitemap.xml 可访问，含页面/新闻/产品）',
  'delivery.h1.count': '每页 H1 标签唯一且已设置',
  'artifact.pagespeed.shots': '已生成 PageSpeed 移动端/桌面端得分截图',
  'delivery.elementor.hidden-both': '已清理同时隐藏于桌面与移动端的 Elementor 板块'
}

/** 获取规则预设交付成果文案（无预设返回空串） */
export function presetDeliverable(ruleKey: string): string {
  return DELIVERABLE_PRESETS[ruleKey] ?? ''
}

/** 将规则行补充预设交付成果：行内未定义时自动填充预设文案 */
export function applyDeliverablePreset(row: { ruleKey: string; deliverable?: string }): { ruleKey: string; deliverable?: string } {
  if (!row.deliverable || !row.deliverable.trim()) {
    const preset = DELIVERABLE_PRESETS[row.ruleKey]
    if (preset) row.deliverable = preset
  }
  return row
}
