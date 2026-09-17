import { NextResponse } from 'next/server'
import { importSites } from '@/lib/store'

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const urls: string[] = Array.isArray(body?.urls) ? body.urls.map(String) : []
  const result = await importSites(urls)
  return NextResponse.json(result)
}
