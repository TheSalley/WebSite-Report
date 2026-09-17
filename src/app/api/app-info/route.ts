import { NextResponse } from 'next/server'
import { initData } from '@/lib/init'

/** 应用信息：首访触发种子初始化（幂等） */
export async function GET() {
  await initData()
  return NextResponse.json({
    name: '网站合规性检测',
    version: '0.1.0',
    framework: 'Next.js',
    description: '自动化网站合规性检测：真实浏览器渲染、25 条内置规则、得分与报告导出'
  })
}
