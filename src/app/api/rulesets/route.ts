import { NextResponse } from 'next/server'
import { listRuleSets, createRuleSet } from '@/lib/store'
import { initData } from '@/lib/init'

export async function GET() {
  await initData()
  const sets = await listRuleSets()
  return NextResponse.json(sets)
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  if (!body?.name) return NextResponse.json({ error: '规则集名称必填' }, { status: 400 })
  const rs = await createRuleSet({ name: String(body.name), description: body.description ? String(body.description) : undefined })
  return NextResponse.json(rs, { status: 201 })
}
