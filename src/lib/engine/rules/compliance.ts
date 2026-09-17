import type { RuleHandler } from '../types'

export const complianceRules: Record<string, RuleHandler> = {
  'compliance.icp': async ({ snapshot }) => {
    const has = /(ICP备|ICP证|京ICP|沪ICP|粤ICP)(\d{6,})?/i.test(snapshot.bodyText)
    return {
      status: has ? 'pass' : 'warn',
      actual: has ? '已展示备案号' : '未发现备案号',
      expected: '页脚存在 ICP 备案号',
      description: has ? 'ICP 备案信息已展示' : '页面未发现 ICP 备案号（中国境内网站要求）'
    }
  },

  'compliance.privacy': async ({ snapshot }) => {
    const has = /(隐私政策|隐私权|privacy\s*policy|用户协议|服务条款|terms\s*of\s*service)/i.test(snapshot.bodyText)
    return {
      status: has ? 'pass' : 'warn',
      actual: has ? '存在相关入口' : '未发现',
      expected: '存在隐私政策/用户协议入口',
      description: has ? '隐私政策或协议入口存在' : '未发现隐私政策/用户协议入口'
    }
  },

  'compliance.copyright.year': async ({ snapshot }) => {
    const currentYear = new Date().getFullYear()
    const hasYear = new RegExp(`(${currentYear})`, 'g').test(snapshot.bodyText)
    return {
      status: hasYear ? 'pass' : 'warn',
      actual: hasYear ? '包含当前年份' : `未包含 ${currentYear}`,
      expected: `版权年份为 ${currentYear}`,
      description: hasYear ? '版权年份与当前年份一致' : '页面未包含当前年份信息'
    }
  }
}
