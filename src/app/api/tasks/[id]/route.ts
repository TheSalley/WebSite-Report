import { NextResponse } from 'next/server'
import { getTask, getSite, getRuleSet, deleteTask } from '@/lib/store'
import { getRunningState } from '@/lib/task-service'

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const t = await getTask(Number(id))
  if (!t) return NextResponse.json({ error: '任务不存在' }, { status: 404 })
  const site = await getSite(t.siteId)
  const ruleSet = await getRuleSet(t.ruleSetId)
  const running = getRunningState(Number(id))
  return NextResponse.json({
    ...t,
    verifyCount: t.verifyCount ?? 0,
    pagespeed: t.pagespeedJson ? JSON.parse(t.pagespeedJson) : null,
    site,
    ruleSet,
    progress: running
      ? { done: running.done, total: running.total, ruleKey: running.currentRuleKey, ruleName: running.currentRuleName, status: running.lastStatus, error: running.error }
      : null
  })
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  await deleteTask(Number(id))
  return NextResponse.json({ ok: true })
}


