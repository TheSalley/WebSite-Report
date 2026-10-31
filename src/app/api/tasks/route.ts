import { NextResponse } from 'next/server'
import { listTasksPage, countRunningTasks, getSite, getRuleSet } from '@/lib/store'
import { startTask, getRunningState } from '@/lib/task-service'

const MAX_PAGE_SIZE = 50

export async function GET(request: Request) {
  const url = new URL(request.url)
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(url.searchParams.get('pageSize')) || 10))

  const { items, total } = await listTasksPage(page, pageSize)
  const running = await countRunningTasks()

  const sites = new Map((await Promise.all(items.map((t) => getSite(t.siteId)))).map((s, i) => [items[i].siteId, s]))
  const sets = new Map((await Promise.all(items.map((t) => getRuleSet(t.ruleSetId)))).map((s, i) => [items[i].ruleSetId, s]))

  const list = items.map((t) => {
    const run = getRunningState(t.id)
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
      error: t.error ?? null,
      pagespeed: t.pagespeedJson ? JSON.parse(t.pagespeedJson) : null,
      site: sites.get(t.siteId) ?? null,
      ruleSet: sets.get(t.ruleSetId) ?? null,
      progress: run
        ? { done: run.done, total: run.total, ruleKey: run.currentRuleKey, ruleName: run.currentRuleName, status: run.lastStatus }
        : null
    }
  })

  return NextResponse.json({ items: list, total, page, pageSize, running })
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
