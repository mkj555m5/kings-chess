// تسجيل نتيجة مباراة مملكة ومنح النقاط (يستدعى من الواجهة بعد المحاكاة)
import { db } from '@/lib/db'
import { awardPoints, cleanTgId, cleanName, ensureUser, jsonError } from '@/lib/kingdom-server'
import { POINTS } from '@/lib/cards-data'

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      tgId?: string
      name?: string
      game?: string // auction | mystery | xo
      mode?: string
      result?: string // win | loss | draw
      scoreMe?: number
      scoreRival?: number
      rivalName?: string
      rivalTgId?: string
      mySquad?: string[]
      rivalSquad?: string[]
      details?: unknown
    }
    const tgId = cleanTgId(body.tgId)
    if (!tgId) return jsonError('سجّل دخول عبر تلجرام لحفظ نقاطك')
    const game = ['auction', 'mystery', 'xo'].includes(String(body.game)) ? String(body.game) : null
    if (!game) return jsonError('لعبة غير معروفة')
    const result = ['win', 'loss', 'draw'].includes(String(body.result)) ? String(body.result) : null
    if (!result) return jsonError('نتيجة غير معروفة')

    const user = await ensureUser(tgId, cleanName(body.name) || undefined)
    if (!user) return jsonError('المستخدم غير موجود', 404)

    // منع تكرار منح النقاط بنفس اللحظة (حماية بسيطة من السبام)
    const recent = await db.kingdomMatch.findFirst({
      where: { playerTgId: tgId, game, createdAt: { gte: new Date(Date.now() - 8000) } },
    })
    const pointsDelta = game === 'auction' ? (result === 'win' ? POINTS.auctionWin : result === 'loss' ? POINTS.loss : POINTS.draw)
      : game === 'mystery' ? (result === 'win' ? POINTS.mysteryWin : result === 'loss' ? POINTS.loss : POINTS.draw)
      : (result === 'win' ? POINTS.xoWin : result === 'loss' ? POINTS.xoLoss : POINTS.xoDraw)

    const match = await db.kingdomMatch.create({
      data: {
        game,
        mode: String(body.mode || '').slice(0, 20),
        playerTgId: tgId,
        playerName: user.displayName,
        rivalName: cleanName(body.rivalName) || 'الخصم',
        rivalTgId: cleanTgId(body.rivalTgId),
        mySquad: JSON.stringify((body.mySquad || []).slice(0, 14)),
        rivalSquad: JSON.stringify((body.rivalSquad || []).slice(0, 14)),
        scoreMe: Math.max(0, Math.min(30, Number(body.scoreMe) || 0)),
        scoreRival: Math.max(0, Math.min(30, Number(body.scoreRival) || 0)),
        result,
        pointsDelta,
        details: JSON.stringify(body.details ?? null).slice(0, 20000),
      },
    })

    // XO الأونلاين: الطرفان يسجلان النتيجة — امنح نقاط الخصم أيضاً (مرة)
    const rivalTg = cleanTgId(body.rivalTgId)
    if (rivalTg && rivalTg !== tgId) {
      const rivalResult = result === 'win' ? 'loss' : result === 'loss' ? 'win' : 'draw'
      await db.kingdomMatch
        .create({
          data: {
            game,
            mode: String(body.mode || '').slice(0, 20),
            playerTgId: rivalTg,
            playerName: cleanName(body.rivalName) || 'الخصم',
            rivalName: user.displayName,
            rivalTgId: tgId,
            scoreMe: Math.max(0, Math.min(30, Number(body.scoreRival) || 0)),
            scoreRival: Math.max(0, Math.min(30, Number(body.scoreMe) || 0)),
            result: rivalResult,
            pointsDelta: game === 'xo' ? (rivalResult === 'win' ? POINTS.xoWin : rivalResult === 'loss' ? POINTS.xoLoss : POINTS.xoDraw) : pointsDelta,
            details: null,
          },
        })
        .catch(() => null)
      const rivalPoints = game === 'xo' ? (rivalResult === 'win' ? POINTS.xoWin : rivalResult === 'loss' ? POINTS.xoLoss : POINTS.xoDraw) : result === 'win' ? POINTS.loss : result === 'loss' ? POINTS.win : POINTS.draw
      await awardPoints(rivalTg, rivalPoints, `${game}_${rivalResult}`, `ضد ${user.displayName}`)
    }

    // منع منح نقاط مكررة خلال 8 ثوانٍ (خسارة السبام فقط، النتيجة تُسجل دائماً)
    if (!recent) {
      const balance = await awardPoints(tgId, pointsDelta, `${game}_${result}`, `ضد ${cleanName(body.rivalName) || 'الخصم'}`)
      return Response.json({ ok: true, pointsDelta, balance, matchId: match.id, counted: true })
    }
    return Response.json({ ok: true, pointsDelta: 0, balance: user.points, matchId: match.id, counted: false })
  } catch {
    return jsonError('خطأ في الخادم', 500)
  }
}
