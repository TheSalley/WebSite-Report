import { NextResponse } from 'next/server'
import { updateRuleSet, deleteRuleSet, duplicateRuleSet, getRuleSet, listRulesForSet } from '@/lib/store'

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const rs = await getRuleSet(Number(id))
  if (!rs) return NextResponse.json({ error: '规则集不存在' }, { status: 404 })
  const rules = await listRulesForSet(Number(id))
  return NextResponse.json({ ruleSet: rs, rules })
}

export async function PUT(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const body = await request.json().catch(() => null)
  if (body?.duplicate) {
    const dup = await duplicateRuleSet(Number(id), String(body.name ?? '副本'))
    if (!dup) return NextResponse.json({ error: '规则集不存在' }, { status: 404 })
    return NextResponse.json(dup)
  }
  const rs = await updateRuleSet(Number(id), { name: body?.name ? String(body.name) : undefined, description: body?.description !== undefined ? String(body.description) : undefined })
  if (!rs) return NextResponse.json({ error: '规则集不存在' }, { status: 404 })
  return NextResponse.json(rs)
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  await deleteRuleSet(Number(id))
  return NextResponse.json({ ok: true })
}


