import { NextResponse } from 'next/server'

export async function GET(_request: Request) {
  // 页面截图导出（附加功能）：预留路由，当前版本未启用
  return NextResponse.json({ error: '页面截图导出暂未开放' }, { status: 404 })
}
