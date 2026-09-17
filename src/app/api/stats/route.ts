import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getStats, recordGame } from '@/lib/stats-store'

const recordSchema = z.object({
  playerName: z.string().trim().min(1).max(30),
  mode: z.enum(['ai', 'online', 'local']),
  result: z.enum(['win', 'loss', 'draw']),
  playerColor: z.enum(['white', 'black']),
  aiLevel: z.string().max(20).optional().nullable(),
  opponent: z.string().max(30).optional().nullable(),
  moves: z.number().int().min(0).max(1000).default(0),
  durationSec: z.number().int().min(0).max(86400).default(0),
})

export async function GET() {
  const response = await getStats()
  return NextResponse.json(response)
}

export async function POST(req: NextRequest) {
  try {
    const json = await req.json()
    const data = recordSchema.parse(json)
    const result = await recordGame(data)
    return NextResponse.json(result)
  } catch (e) {
    console.error('[api/stats POST] error:', e)
    return NextResponse.json({ ok: false }, { status: 400 })
  }
}
