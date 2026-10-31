import { NextResponse } from 'next/server'
import { buildReportData, buildReportHtml, buildReportPdf } from '@/lib/report/report-service'

/** ISO 时间 → 文件名安全格式：2026-09-15_10-22-43 */
function formatFileNameTime(iso: string | null | undefined): string {
  if (!iso) return '未知时间'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '未知时间'
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`
}

/** 清洗站点名称中的非法文件名字符 */
function sanitizeFilename(name: string): string {
  const clean = name.replace(/[\\/:*?"<>|]/g, '_').trim()
  return clean || '任务'
}

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  try {
    const data = await buildReportData(Number(id))
    const html = await buildReportHtml(data)
    const url = new URL(request.url)
    if (url.searchParams.get('format') === 'html') {
      return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
    }
    if (url.searchParams.get('format') === 'pdf') {
      const pdf = await buildReportPdf(Number(id))
      const siteName = sanitizeFilename(data.site?.name ?? `任务${id}`)
      const time = formatFileNameTime(data.task?.startedAt)
      const filename = `${siteName}-${time}.pdf`
      return new NextResponse(new Uint8Array(pdf), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="web-report-${id}.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}`
        }
      })
    }
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 404 })
  }
}


