import { NextResponse } from 'next/server'
import { updateNote, updateDeliverable, updateResultStatus } from '@/lib/task-service'
import type { CheckStatus } from '@/lib/types'

const ALLOWED_STATUS: CheckStatus[] = ['pass', 'warn', 'fail', 'skip', 'verify']

export async function PUT(request: Request, ctx: { params: Promise<{ id: string; resultId: string }> }) {
  const { resultId } = await ctx.params
  const body = await request.json().catch(() => null)
  const status = body?.status
  if (status) {
    if (!ALLOWED_STATUS.includes(status)) {
      return NextResponse.json({ error: '无效的状态值' }, { status: 400 })
    }
    await updateResultStatus(Number(resultId), status as CheckStatus)
  } else if (body?.deliverable !== undefined) {
    await updateDeliverable(Number(resultId), String(body.deliverable ?? ''))
  } else {
    await updateNote(Number(resultId), String(body?.note ?? ''))
  }
  return NextResponse.json({ ok: true })
}


