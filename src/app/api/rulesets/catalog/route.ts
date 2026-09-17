import { NextResponse } from 'next/server'
import { getRuleCatalog } from '@/lib/seed'

export async function GET() {
  return NextResponse.json(getRuleCatalog())
}
