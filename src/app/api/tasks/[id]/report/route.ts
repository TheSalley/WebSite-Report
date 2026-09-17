import { NextResponse } from 'next/server'
import { buildReportData, buildReportHtml, buildReportPdf } from '@/lib/report/report-service'

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  try {
    const data = await buildReportData(Number(id))
    const html = buildReportHtml(data)
    const url = new URL(request.url)
    if (url.searchParams.get('format') === 'html') {
      return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
    }
    if (url.searchParams.get('format') === 'pdf') {
      const pdf = await buildReportPdf(Number(id))
      return new NextResponse(new Uint8Array(pdf), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="web-report-${id}.pdf"`
        }
      })
    }
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 404 })
  }
}


