import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import type { StatsResponse } from '@/lib/game-types'

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
  try {
    const [aiAgg, onlineAgg, localAgg, topPlayers, recent] = await Promise.all([
      db.gameRecord.groupBy({
        by: ['result'],
        where: { mode: 'ai' },
        _count: { result: true },
      }),
      db.gameRecord.groupBy({
        by: ['result'],
        where: { mode: 'online' },
        _count: { result: true },
      }),
      db.gameRecord.count(),
      db.gameRecord.groupBy({
        by: ['playerName'],
        where: { mode: 'online', result: 'win' },
        _count: { playerName: true },
        orderBy: { _count: { playerName: 'desc' } },
        take: 10,
      }),
      db.gameRecord.findMany({
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: { playerName: true, mode: true, result: true, createdAt: true },
      }),
    ])

    const byResult = (agg: { result: string; _count: { result: number } }[], key: string) =>
      agg.find((a) => a.result === key)?._count.result ?? 0

    const aiWins = byResult(aiAgg, 'win')
    const aiLosses = byResult(aiAgg, 'loss')
    const onlineWins = byResult(onlineAgg, 'win')
    const draws = byResult(aiAgg, 'draw') + byResult(onlineAgg, 'draw')

    const response: StatsResponse = {
      totals: {
        games: localAgg,
        aiWins,
        aiLosses,
        onlineWins,
        draws,
      },
      topPlayers: topPlayers.map((t) => ({ playerName: t.playerName, wins: t._count.playerName })),
      recent: recent.map((r) => ({
        playerName: r.playerName,
        mode: r.mode,
        result: r.result,
        createdAt: r.createdAt.toISOString(),
      })),
    }
    return NextResponse.json(response)
  } catch (e) {
    console.error('[api/stats GET] error:', e)
    return NextResponse.json(
      { totals: { games: 0, aiWins: 0, aiLosses: 0, onlineWins: 0, draws: 0 }, topPlayers: [], recent: [] },
      { status: 200 },
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const json = await req.json()
    const data = recordSchema.parse(json)
    const record = await db.gameRecord.create({ data })
    return NextResponse.json({ ok: true, id: record.id })
  } catch (e) {
    console.error('[api/stats POST] error:', e)
    return NextResponse.json({ ok: false }, { status: 400 })
  }
}
