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
    id: t.id,
    siteId: t.siteId,
    ruleSetId: t.ruleSetId,
    status: t.status,
    passCount: t.passCount,
    warnCount: t.warnCount,
    failCount: t.failCount,
    skipCount: t.skipCount,
    verifyCount: t.verifyCount ?? 0,
    startedAt: t.startedAt,
    finishedAt: t.finishedAt,
    error: t.error ?? null,
    pagespeed: t.pagespeedJson ? JSON.parse(t.pagespeedJson) : null,
    pageSet: t.pageSetJson ? JSON.parse(t.pageSetJson) : null,
    siteData: t.siteDataJson ? JSON.parse(t.siteDataJson) : null,
    site,
    ruleSet,
    progress: running
      ? {
          done: running.done,
          total: running.total,
          ruleKey: running.currentRuleKey,
          ruleName: running.currentRuleName,
          status: running.lastStatus,
          error: running.error,
          phase: running.phase,
          phaseName: running.phaseName,
          phaseIndex: running.phaseIndex,
          phaseCount: running.phaseCount,
          queued: running.queued
        }
      : null
  })
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const taskId = Number(id)
  const task = await getTask(taskId)
  if (!task) return NextResponse.json({ error: '任务不存在' }, { status: 404 })
  if (task.status === 'running' || getRunningState(taskId)) {
    return NextResponse.json({ error: '任务运行中，请先终止并等待结束再删除' }, { status: 409 })
  }
  await deleteTask(taskId)
  return NextResponse.json({ ok: true })
}


