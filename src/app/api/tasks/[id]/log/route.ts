import { NextResponse } from 'next/server'
import { readTaskLog } from '@/lib/logger'

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const lines = readTaskLog(Number(id))
  return NextResponse.json({ lines })
}