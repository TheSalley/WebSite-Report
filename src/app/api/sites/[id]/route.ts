import { NextResponse } from 'next/server'
import { updateSite, deleteSite } from '@/lib/store'

export async function PUT(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const body = await request.json().catch(() => null)
  const site = await updateSite(Number(id), {
    name: body?.name ? String(body.name) : undefined,
    url: body?.url ? String(body.url) : undefined,
    remark: body?.remark !== undefined ? String(body.remark) : undefined
  })
  if (!site) return NextResponse.json({ error: '站点不存在' }, { status: 404 })
  return NextResponse.json(site)
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  await deleteSite(Number(id))
  return NextResponse.json({ ok: true })
}


