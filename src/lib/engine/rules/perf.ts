import type { RuleHandler } from '../types'

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
  }
}
