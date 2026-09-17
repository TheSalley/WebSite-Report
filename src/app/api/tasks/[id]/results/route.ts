import { NextResponse } from 'next/server'
import { listCheckResults } from '@/lib/store'

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const results = await listCheckResults(Number(id))
  return NextResponse.json(results)
}


