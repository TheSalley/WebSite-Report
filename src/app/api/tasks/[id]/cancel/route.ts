import { NextResponse } from 'next/server'
import { cancelTask } from '@/lib/task-service'

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  await cancelTask(Number(id))
  return NextResponse.json({ ok: true })
}


