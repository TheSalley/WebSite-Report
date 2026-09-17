import { NextResponse } from 'next/server'
import { listSites, createSite } from '@/lib/store'
import { initData } from '@/lib/init'

export async function GET() {
  await initData()
  const sites = await listSites()
  return NextResponse.json(sites)
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  if (!body?.name || !body?.url) {
    return NextResponse.json({ error: '名称和 URL 为必填项' }, { status: 400 })
  }
  const site = await createSite({ name: String(body.name), url: String(body.url), remark: body.remark ? String(body.remark) : undefined })
  return NextResponse.json(site, { status: 201 })
}
