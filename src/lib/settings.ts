import { getSettings, saveSettings } from './store'
import { DEFAULT_REPORT_SETTINGS, type ReportSettings } from './types'

/** 从 KV 存储读取报告设置（缺省用默认） */
export async function getReportSettings(): Promise<ReportSettings> {
  const rows = await getSettings()
  const out: Partial<ReportSettings> = {}
  for (const key of Object.keys(DEFAULT_REPORT_SETTINGS) as (keyof ReportSettings)[]) {
    const raw = rows[`report.${key}`]
    if (raw === undefined) continue
    ;(out as Record<string, unknown>)[key] = raw
  }
  return { ...DEFAULT_REPORT_SETTINGS, ...out }
}

/** 保存报告设置 */
export async function saveReportSettings(settings: Partial<ReportSettings>): Promise<ReportSettings> {
  const current = await getReportSettings()
  const merged: ReportSettings = { ...current, ...settings }
  const rows = await getSettings()
  rows['report.companyName'] = merged.companyName
  rows['report.logoPath'] = merged.logoPath
  rows['report.reportTitle'] = merged.reportTitle
  rows['report.footerText'] = merged.footerText
  rows['report.psiApiKey'] = merged.psiApiKey
  await saveSettings(rows)
  return merged
}
