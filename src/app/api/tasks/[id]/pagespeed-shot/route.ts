import { NextResponse } from 'next/server'
import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { DATA_DIR } from '@/lib/store'

/** 替换任务的 PageSpeed 截图（移动端/桌面端），覆盖保存为 pagespeed-{strategy}.png */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const form = await request.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: '请求格式错误' }, { status: 400 })

  const strategy = String(form.get('strategy') ?? '')
  if (strategy !== 'mobile' && strategy !== 'desktop') {
    return NextResponse.json({ error: 'strategy 必须是 mobile 或 desktop' }, { status: 400 })
  }

  const file = form.get('file')
  if (!file || typeof file === 'string' || !(file instanceof File)) {
    return NextResponse.json({ error: '缺少截图文件' }, { status: 400 })
  }

  const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
  if (!allowed.includes(file.type)) {
    return NextResponse.json({ error: '仅支持 PNG/JPG/WebP/GIF 图片' }, { status: 400 })
  }

  const dir = join(DATA_DIR, 'screenshots', 'task-' + id)
  await mkdir(dir, { recursive: true })
  const target = join(dir, 'pagespeed-' + strategy + '.png')
  await writeFile(target, Buffer.from(await file.arrayBuffer()))

  return NextResponse.json({ ok: true, url: `/api/screenshots/task-${id}/pagespeed-${strategy}.png` })
}
