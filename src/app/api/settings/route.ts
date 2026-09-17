import { NextResponse } from 'next/server'
import { getReportSettings, saveReportSettings } from '@/lib/settings'
import type { ReportSettings } from '@/lib/types'

export async function GET() {
  const settings = await getReportSettings()
  return NextResponse.json(settings)
}

export async function PUT(request: Request) {
  const body = (await request.json().catch(() => null)) as Partial<ReportSettings> | null
  const saved = await saveReportSettings(body ?? {})
  return NextResponse.json(saved)
}
