import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { resolve, sep } from 'path'
import { DATA_DIR } from '@/lib/store'

export async function GET(_request: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params
  const parts = Array.isArray(path) ? path : [path]
  const root = resolve(DATA_DIR, 'screenshots')
  const full = resolve(root, ...parts)
  // 路径前缀校验：必须位于截图根目录内
  if (!full.startsWith(root + sep) && full !== root) {
    return NextResponse.json({ error: '非法路径' }, { status: 400 })
  }
  try {
    const buffer = await readFile(full)
    return new NextResponse(new Uint8Array(buffer), {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-cache' }
    })
  } catch {
    return NextResponse.json({ error: '截图不存在' }, { status: 404 })
  }
}



