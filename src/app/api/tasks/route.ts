import { NextResponse } from 'next/server'
import { listTasksRaw, getSite, getRuleSet } from '@/lib/store'
import { startTask, getRunningState } from '@/lib/task-service'

async function decorateTasks() {
  const tasks = await listTasksRaw(100)
  const sites = new Map((await Promise.all(tasks.map((t) => getSite(t.siteId)))).map((s, i) => [tasks[i].siteId, s]))
  const sets = new Map((await Promise.all(tasks.map((t) => getRuleSet(t.ruleSetId)))).map((s, i) => [tasks[i].ruleSetId, s]))
  return tasks.map((t) => {
    const running = getRunningState(t.id)
    return {
      id: t.id,
      siteId: t.siteId,
      ruleSetId: t.ruleSetId,
      status: t.status,
      score: t.score,
      passCount: t.passCount,
      warnCount: t.warnCount,
      failCount: t.failCount,
      skipCount: t.skipCount,
      verifyCount: t.verifyCount ?? 0,
      startedAt: t.startedAt,
      finishedAt: t.finishedAt,
      pagespeed: t.pagespeedJson ? JSON.parse(t.pagespeedJson) : null,
      site: sites.get(t.siteId) ?? null,
      ruleSet: sets.get(t.ruleSetId) ?? null,
      progress: running
        ? { done: running.done, total: running.total, ruleKey: running.currentRuleKey, ruleName: running.currentRuleName, status: running.lastStatus }
        : null
    }
  })
}

export async function GET() {
  return NextResponse.json(await decorateTasks())
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const siteId = Number(body?.siteId)
  const ruleSetId = Number(body?.ruleSetId)
  if (!siteId || !ruleSetId) return NextResponse.json({ error: '站点和规则集为必填项' }, { status: 400 })
  try {
    const taskId = await startTask(siteId, ruleSetId)
    return NextResponse.json({ id: taskId }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}
