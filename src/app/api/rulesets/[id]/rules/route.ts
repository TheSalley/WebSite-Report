import { NextResponse } from 'next/server'
import { listRulesForSet, replaceRules } from '@/lib/store'
import type { RuleRow } from '@/lib/store'

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const rules = await listRulesForSet(Number(id))
  return NextResponse.json(rules)
}

export async function PUT(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const rules = (await request.json().catch(() => null)) as Omit<RuleRow, 'id'>[]
  const saved = await replaceRules(
    Number(id),
    (rules ?? []).map((r, idx) => ({ ...r, sortOrder: r.sortOrder ?? idx }))
  )
  return NextResponse.json(saved)
}


