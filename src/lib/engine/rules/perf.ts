import type { RuleHandler } from '../types'
import { fetchPageSpeed } from '../pagespeed'
import type { PageSpeedReportData } from '../../types'

function timeStatus(value: number, passMs: number, warnMs: number): { status: 'pass' | 'warn' | 'fail'; label: string } {
  if (value <= 0) return { status: 'fail', label: '未采集到' }
  if (value <= passMs) return { status: 'pass', label: `${value}ms` }
  if (value <= warnMs) return { status: 'warn', label: `${value}ms` }
  return { status: 'fail', label: `${value}ms` }
}

export const perfRules: Record<string, RuleHandler> = {
  'perf.ttfb': async ({ snapshot, params }) => {
    const passMs = Number(params.passMs ?? 800)
    const warnMs = Number(params.warnMs ?? 1500)
    const value = snapshot.perf.ttfb
    const { status, label } = timeStatus(value, passMs, warnMs)
    return {
      status,
      actual: label,
      expected: `≤ ${passMs}ms（${passMs}~${warnMs}ms 警告）`,
      description: status === 'pass' ? '服务器响应快' : status === 'warn' ? 'TTFB 偏慢' : 'TTFB 过慢或未采集'
    }
  },

  'perf.domcontentloaded': async ({ snapshot, params }) => {
    const passMs = Number(params.passMs ?? 2000)
    const warnMs = Number(params.warnMs ?? 4000)
    const value = snapshot.perf.domContentLoaded
    const { status, label } = timeStatus(value, passMs, warnMs)
    return {
      status,
      actual: label,
      expected: `≤ ${passMs}ms（${passMs}~${warnMs}ms 警告）`,
      description: status === 'pass' ? 'DOM 加载快' : status === 'warn' ? 'DOM 加载偏慢' : 'DOM 加载过慢或未采集'
    }
  },

  'perf.load': async ({ snapshot, params }) => {
    const passMs = Number(params.passMs ?? 3000)
    const warnMs = Number(params.warnMs ?? 6000)
    const value = snapshot.perf.load
    const { status, label } = timeStatus(value, passMs, warnMs)
    return {
      status,
      actual: label,
      expected: `≤ ${passMs}ms（${passMs}~${warnMs}ms 警告）`,
      description: status === 'pass' ? '页面加载快' : status === 'warn' ? '页面加载偏慢' : '页面加载过慢或未采集'
    }
  },

  'perf.total.size': async ({ snapshot, params }) => {
    const passMb = Number(params.passMb ?? 3)
    const warnMb = Number(params.warnMb ?? 6)
    const mb = snapshot.network.totalBytes / 1024 / 1024
    const status = mb <= passMb ? 'pass' : mb <= warnMb ? 'warn' : 'fail'
    return {
      status,
      actual: `${mb.toFixed(2)} MB`,
      expected: `≤ ${passMb} MB（${passMb}~${warnMb} MB 警告）`,
      description: status === 'pass' ? '页面体积合理' : status === 'warn' ? '页面体积偏大' : '页面体积过大'
    }
  },

  'perf.lcp': async ({ snapshot, params }) => {
    const passMs = Number(params.passMs ?? 2500)
    const warnMs = Number(params.warnMs ?? 4000)
    const value = snapshot.perf.lcp
    const { status, label } = timeStatus(value, passMs, warnMs)
    return {
      status,
      actual: label,
      expected: `≤ ${passMs}ms（${passMs}~${warnMs}ms 警告）`,
      description: status === 'pass' ? 'LCP 达标' : status === 'warn' ? 'LCP 偏慢' : 'LCP 过慢或未采集'
    }
  },

  /** 站点级：PageSpeed 性能评分（整站仅执行一次，取移动端/桌面端较低性能分） */
  'perf.pagespeed.score': async ({ snapshot, params }) => {
    const passScore = Number(params.passScore ?? 90)
    const warnScore = Number(params.warnScore ?? 50)
    let report: PageSpeedReportData | null = null
    try {
      const origin = new URL(snapshot.finalUrl).origin
      report = await fetchPageSpeed(origin)
      const mobile = report.mobile?.ok ? report.mobile : null
      const desktop = report.desktop?.ok ? report.desktop : null
      const pick = mobile ?? desktop
      if (!pick) {
        const err = report.mobile?.error || report.desktop?.error || 'PageSpeed 评分获取失败'
        return {
          status: 'fail',
          actual: '采集失败',
          expected: `性能评分 ≥ ${passScore}`,
          description: `PageSpeed 评分采集失败：${err.slice(0, 120)}`,
          data: report
        }
      }
      const perf = pick.categories.find((x) => x.id === 'performance')
      const score = perf?.score ?? 0
      const mobileScore = mobile ? (mobile.categories.find((x) => x.id === 'performance')?.score ?? 0) : null
      const desktopScore = desktop ? (desktop.categories.find((x) => x.id === 'performance')?.score ?? 0) : null
      const status = score >= passScore ? 'pass' : score >= warnScore ? 'warn' : 'fail'
      const detail =
        mobileScore != null && desktopScore != null
          ? `移动 ${mobileScore} / 桌面 ${desktopScore}`
          : mobileScore != null
            ? `移动 ${mobileScore}`
            : `桌面 ${desktopScore}`
      return {
        status,
        actual: `性能 ${score}（${detail}）`,
        expected: `性能评分 ≥ ${passScore}（${warnScore}~100 为警告，< ${warnScore} 为不达标）`,
        description:
          status === 'pass'
            ? `PageSpeed 性能评分达标：${detail}`
            : status === 'warn'
              ? `PageSpeed 性能评分需优化（${detail}）`
              : `PageSpeed 性能评分不达标（${detail}）`,
        data: report
      }
    } catch (e) {
      return {
        status: 'fail',
        actual: '采集异常',
        expected: `性能评分 ≥ ${passScore}`,
        description: `PageSpeed 评分采集异常：${(e as Error).message.slice(0, 120)}`,
        data: report ?? undefined
      }
    }
  }
}
