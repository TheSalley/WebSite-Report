import type { RuleHandler } from '../types'

/** 合同交付项中可自动验证的站点功能 */
export const contractRules: Record<string, RuleHandler> = {
  /** 全站搜索功能：存在搜索输入框或搜索入口 */
  'contract.search': async ({ page }) => {
    try {
      const found = await page!.evaluate(() => {
        const inputs = Array.from(
          document.querySelectorAll(
            'input[type="search"], input[placeholder*="搜索" i], input[placeholder*="search" i], input[name*="search" i], input[id*="search" i]'
          )
        )
        return inputs.length > 0 || /(站内搜索|网站搜索|搜索)/i.test((document.body.innerText || '').slice(0, 6000))
      })
      return {
        status: found ? 'pass' : 'warn',
        actual: found ? '已发现搜索入口' : '未发现搜索入口',
        expected: '存在全站搜索框',
        description: found ? '站点提供全站搜索功能' : '未检测到搜索输入框，建议按合同配置全站搜索'
      }
    } catch {
      return { status: 'warn', actual: '检测失败', expected: '存在搜索入口', description: '搜索功能检测执行异常，请人工确认' }
    }
  },

  /** 多转化入口：存在询盘/联系表单或联系链接 */
  'contract.contact': async ({ page }) => {
    try {
      const found = await page!.evaluate(() => {
        const forms = document.querySelectorAll('form, [data-form], .contact-form, .inquiry-form, [id*="contact" i]')
        return forms.length > 0
      })
      return {
        status: found ? 'pass' : 'warn',
        actual: found ? '已发现转化入口' : '未发现表单/联系模块',
        expected: '存在全局或页面内询盘表单',
        description: found ? '页面提供联系/询盘表单入口' : '未检测到询盘表单，建议按合同配置多转化入口'
      }
    } catch {
      return { status: 'warn', actual: '检测失败', expected: '存在转化入口', description: '转化入口检测执行异常，请人工确认' }
    }
  },

  /** GA 预埋：存在分析脚本 */
  'contract.ga': async ({ page }) => {
    try {
      const has = await page!.evaluate(() => {
        const html = (document.documentElement.outerHTML || '').slice(0, 300000)
        return /googletagmanager|gtag\(|google-analytics|_gaq|clarity|umami/i.test(html)
      })
      return {
        status: has ? 'pass' : 'warn',
        actual: has ? '已发现统计脚本' : '未发现统计脚本',
        expected: '预埋 Google Analytics / 统计代码',
        description: has ? '站点已预埋流量统计脚本' : '未检测到 GA/统计脚本，建议按合同预埋 GA'
      }
    } catch {
      return { status: 'warn', actual: '检测失败', expected: '存在统计脚本', description: '统计脚本检测执行异常，请人工确认' }
    }
  },

  /** Google 翻译插件（多语言） */
  'contract.gtranslate': async ({ page }) => {
    try {
      const has = await page!.evaluate(() => {
        const html = (document.documentElement.outerHTML || '').slice(0, 300000)
        return document.querySelector('.goog-te-gadget, #google_translate_element, .google-translate') !== null || /translate\.google\.com|google_translate|goog-te-banner/i.test(html)
      })
      return {
        status: has ? 'pass' : 'warn',
        actual: has ? '已发现翻译组件' : '未发现翻译组件',
        expected: '嵌入 Google 翻译插件（一键多语言）',
        description: has ? '站点提供 Google 翻译能力' : '未检测到 Google 翻译插件，请人工确认是否配置'
      }
    } catch {
      return { status: 'warn', actual: '检测失败', expected: '存在翻译插件', description: '翻译插件检测执行异常，请人工确认' }
    }
  }
}
