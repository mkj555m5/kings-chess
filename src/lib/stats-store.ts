// مخزن الإحصائيات العالمية - خلفيتان حسب البيئة:
// - Cloudflare Workers: D1 (SQLite على الحافة) عبر ربط DB
// - Node (تطوير/Railway): Prisma + SQLite
// استيراد Prisma كسول حتى لا يدخل حزمة Cloudflare إطلاقاً
import type { StatsResponse } from './game-types'

export interface RecordInput {
  playerName: string
  mode: 'ai' | 'online' | 'local'
  result: 'win' | 'loss' | 'draw'
  playerColor: 'white' | 'black'
  aiLevel?: string | null
  opponent?: string | null
  moves: number
  durationSec: number
}

interface D1ResultSet<T> {
  results: T[]
}

interface D1Like {
  prepare(query: string): {
    bind(...values: unknown[]): { run(): Promise<unknown>; all<T>(): Promise<D1ResultSet<T>> }
    all<T>(): Promise<D1ResultSet<T>>
  }
}

interface CfEnv {
  DB?: D1Like
}

export const EMPTY_STATS: StatsResponse = {
  totals: { games: 0, aiWins: 0, aiLosses: 0, onlineWins: 0, draws: 0 },
  topPlayers: [],
  recent: [],
}

/** يقرأ ربط D1 إن كنا على Cloudflare، وإلا يعيد null */
async function getD1(): Promise<D1Like | null> {
  if (process.env.CF_DEPLOY !== '1') return null
  try {
    const mod = (await import('@opennextjs/cloudflare')) as {
      getCloudflareContext(): { env: CfEnv }
    }
    const { env } = mod.getCloudflareContext()
    return env?.DB || null
  } catch {
    return null
  }
}

export async function getStats(): Promise<StatsResponse> {
  const d1 = await getD1()
  if (d1) return d1GetStats(d1)
  return prismaGetStats()
}

export async function recordGame(input: RecordInput): Promise<{ ok: boolean; id?: string }> {
  const d1 = await getD1()
  if (d1) return d1Record(d1, input)
  return prismaRecord(input)
}

/* ================= Cloudflare D1 ================= */

async function d1GetStats(db: D1Like): Promise<StatsResponse> {
  try {
    const [byModeResult, top, recent] = await Promise.all([
      db.prepare('SELECT mode, result, COUNT(*) AS c FROM game_record GROUP BY mode, result').all<{ mode: string; result: string; c: number }>(),
      db
        .prepare("SELECT player_name AS playerName, COUNT(*) AS wins FROM game_record WHERE mode = 'online' AND result = 'win' GROUP BY player_name ORDER BY wins DESC LIMIT 10")
        .all<{ playerName: string; wins: number }>(),
      db.prepare('SELECT player_name AS playerName, mode, result, created_at AS createdAt FROM game_record ORDER BY created_at DESC LIMIT 8').all<{
        playerName: string
        mode: string
        result: string
        createdAt: string
      }>(),
    ])

    const byResult = (mode: string, result: string) =>
      byModeResult.results.find((r) => r.mode === mode && r.result === result)?.c ?? 0

    const aiWins = byResult('ai', 'win')
    const aiLosses = byResult('ai', 'loss')
    const onlineWins = byResult('online', 'win')
    const draws = byResult('ai', 'draw') + byResult('online', 'draw')
    const games = aiWins + aiLosses + byResult('ai', 'draw') + onlineWins + byResult('online', 'draw') + byResult('local', 'win') + byResult('local', 'loss') + byResult('local', 'draw')

    return {
      totals: { games, aiWins, aiLosses, onlineWins, draws },
      topPlayers: top.results.map((t) => ({ playerName: t.playerName, wins: t.wins })),
      recent: recent.results.map((r) => ({
        playerName: r.playerName,
        mode: r.mode,
        result: r.result,
        createdAt: new Date(r.createdAt).toISOString(),
      })),
    }
  } catch (e) {
    console.error('[stats-store] D1 GET failed (هل أنشأت قاعدة البيانات وطبقت db/schema.sql؟):', e)
    return EMPTY_STATS
  }
}

async function d1Record(db: D1Like, input: RecordInput): Promise<{ ok: boolean; id?: string }> {
  try {
    const id = crypto.randomUUID()
    await db
      .prepare(
        "INSERT INTO game_record (id, player_name, mode, result, player_color, ai_level, opponent, moves, duration_sec, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))",
      )
      .bind(id, input.playerName, input.mode, input.result, input.playerColor, input.aiLevel ?? null, input.opponent ?? null, input.moves, input.durationSec)
      .run()
    return { ok: true, id }
  } catch (e) {
    console.error('[stats-store] D1 INSERT failed:', e)
    return { ok: false }
  }
}

/* ================= Prisma (Node) ================= */

async function getPrisma() {
  const mod = await import('@/lib/db')
  return mod.db
}

async function prismaGetStats(): Promise<StatsResponse> {
  try {
    const db = await getPrisma()
    const [aiAgg, onlineAgg, localAgg, topPlayers, recent] = await Promise.all([
      db.gameRecord.groupBy({ by: ['result'], where: { mode: 'ai' }, _count: { result: true } }),
      db.gameRecord.groupBy({ by: ['result'], where: { mode: 'online' }, _count: { result: true } }),
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

    return {
      totals: {
        games: localAgg,
        aiWins: byResult(aiAgg, 'win'),
        aiLosses: byResult(aiAgg, 'loss'),
        onlineWins: byResult(onlineAgg, 'win'),
        draws: byResult(aiAgg, 'draw') + byResult(onlineAgg, 'draw'),
      },
      topPlayers: topPlayers.map((t) => ({ playerName: t.playerName, wins: t._count.playerName })),
      recent: recent.map((r) => ({
        playerName: r.playerName,
        mode: r.mode,
        result: r.result,
        createdAt: r.createdAt.toISOString(),
      })),
    }
  } catch (e) {
    console.error('[stats-store] Prisma GET failed:', e)
    return EMPTY_STATS
  }
}

async function prismaRecord(input: RecordInput): Promise<{ ok: boolean; id?: string }> {
  try {
    const db = await getPrisma()
    const record = await db.gameRecord.create({ data: input })
    return { ok: true, id: record.id }
  } catch (e) {
    console.error('[stats-store] Prisma INSERT failed:', e)
    return { ok: false }
  }
}
